"use strict";

import BaseAdapter from "./base.js";

/**
 * Batch operations class. Executes a function providing an object exposing an
 * API to schedule atomic CRUD operations and wrap them within and IDB
 * transaction.
 */
class Batch {
  /**
   * Constructor.
   *
   * @param  {IDBTransaction} transaction
   * @param  {IDBStore}       store
   */
  constructor(transaction, store) {
    this._transaction = transaction;
    this._store = store;
    this._operations = [];
    this._errors = [];
  }

  /**
   * IDBStore methods map.
   */
  static get BATCH_STORE_METHODS() {
    return {
      clear:  "clear",
      create: "add",
      update: "put",
      delete: "delete"
    };
  }

  /**
   * Aborts the current transaction, cleaning all pending operations.
   */
  abort() {
    this._operations.length = 0;
    this._transaction.abort();
  }

  /**
   * Retrieves an existing record by its id. Note that this method won't find
   * records scheduled for write within the current transaction.
   *
   * @param  {Number|String} id
   * @return {Object}
   */
  get(id) {
    if (!id) {
      return Promise.reject(new Error("Id not provided."));
    }
    return new Promise((resolve, reject) => {
      const request = this._store.get(id);
      request.onerror = event => reject(event.target.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Retrieves all existing records. Note that this method won't find records
   * scheduled for write within the current transaction.
   *
   * @return {Array}
   */
  list() {
    return new Promise((resolve, reject) => {
      const results = [];
      const request = this._store.openCursor();
      request.onerror = event => reject(event.target.error);
      request.onsuccess = event => {
        var cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
    });
  }

  /**
   * Schedules a write operation for current transaction.
   *
   * @param  {String} type
   * @param  {Object} data
   * @return {Promise}
   */
  _scheduleWrite(type, data) {
    const operation = {type, data};
    this._operations.push(operation);
    return new Promise((resolve, reject) => {
      const storeMethod = Batch.BATCH_STORE_METHODS[type];
      try {
        const request = this._store[storeMethod](data);
        request.onerror = event => {
          this._errors.push(event.target.error);
          reject(event.target.error);
        };
        request.onsuccess = event => resolve(operation);
      } catch (err) {
        err.operation = operation;
        this._errors.push(err);
        reject(event.target.err);
      }
    });
  }

  /**
   * Clears the current store.
   *
   * @return {Promise} A promise resolving with the operation descriptor.
   */
  clear() {
    return this._scheduleWrite("clear");
  }

  /**
   * Adds a record to the store.
   *
   * @return {Promise} A promise resolving with the operation descriptor.
   */
  create(data) {
    return this._scheduleWrite("create", data);
  }

  /**
   * Updates a record from the store.
   *
   * @return {Promise} A promise resolving with the operation descriptor.
   */
  update(data) {
    return this._scheduleWrite("update", data);
  }

  /**
   * Deletes a record from the store.
   *
   * @return {Promise} A promise resolving with the operation descriptor.
   */
  delete(data) {
    return this._scheduleWrite("delete", data);
  }

  /**
   * Registers a function performing the planned transactional operations, and
   * commits the transaction.
   *
   * @param  {Function(Batch)} operationsFn The function planning operations.
   * @return {Promise}
   */
  execute(operationsFn) {
    return Promise.resolve(operationsFn(this))
      .then(result => {
        return new Promise((resolve, reject) => {
          const _resolve = result => resolve({
            result,
            operations: this._operations,
            errors: this._errors,
          });
          this._transaction.onerror = event => {
            this._errors = this._errors.concat({
              type: "error",
              error: event.target.error
            });
            _resolve(result);
          };
          this._transaction.onabort = () => _resolve(result);
          this._transaction.oncomplete = () => _resolve(result);
        });
      })
      .catch(err => {
        return {
          result: undefined,
          operations: this._operations,
          errors: this._errors.concat(err),
        };
      });
  }
}

/**
 * IndexedDB adapter.
 */
export default class IDB extends BaseAdapter {
  /**
   * Constructs this adapter.
   *
   * @param  {String} dbname The database name.
   */
  constructor(dbname) {
    super();
    this._db = null;
    // public properties
    /**
     * The database name.
     * @type {String}
     */
    this.dbname = dbname;
  }

  /**
   * Returns a functtion decorating an error and rethrowing it, preserving its
   * stack.
   *
   * @param  {String} method The name of the function the error has been thrown
   *                         from.
   */
  _handleError(method) {
    return err => {
      const error = new Error(method + "() " + err);
      error.stack = err.stack;
      throw error;
    };
  }

  /**
   * Ensures a connection to the IndexedDB database has been opened.
   *
   * @return {Promise}
   */
  open() {
    if (this._db) {
      return Promise.resolve(this);
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbname, 1);
      request.onupgradeneeded = event => {
        // DB object
        const db = event.target.result;
        // Main collection store
        const collStore = db.createObjectStore(this.dbname, {
          keyPath: "id"
        });
        // Primary key (generated by IdSchema, UUID by default)
        collStore.createIndex("id", "id", { unique: true });
        // Local record status ("synced", "created", "updated", "deleted")
        collStore.createIndex("_status", "_status");
        // Last modified field
        collStore.createIndex("last_modified", "last_modified");

        // Metadata store
        const metaStore = db.createObjectStore("__meta__", {
          keyPath: "name"
        });
        metaStore.createIndex("name", "name", { unique: true });
      };
      request.onerror = event => reject(event.target.error);
      request.onsuccess = event => {
        this._db = event.target.result;
        resolve(this);
      };
    });
  }

  /**
   * Returns a transaction and a store objects for this collection.
   *
   * To determine if a transaction has completed successfully, we should rather
   * listen to the transaction’s complete event rather than the IDBObjectStore
   * request’s success event, because the transaction may still fail after the
   * success event fires.
   *
   * @param  {String}      mode  Transaction mode ("readwrite" or undefined)
   * @param  {String|null} name  Store name (defaults to coll name)
   * @return {Object}
   */
  prepare(mode=undefined, name=null) {
    const storeName = name || this.dbname;
    // On Safari, calling IDBDatabase.transaction with mode == undefined raises a TypeError.
    const transaction = mode ? this._db.transaction([storeName], mode)
                             : this._db.transaction([storeName]);
    const store = transaction.objectStore(storeName);
    return {transaction, store};
  }

  /**
   * Batch operations.
   *
   * @param  {Function} operationsFn The operations function, which should
   *                                 either return nothing or a Promise.
   * @return {Promise}
   */
  batch(operationsFn) {
    return this.open().then(() => {
      const {transaction, store} = this.prepare("readwrite");
      const batch = new Batch(transaction, store);
      return batch.execute(operationsFn);
    });
  }

  /**
   * Executes a single operation within a transaction.
   *
   * @param  {String} name The operation name.
   * @param  {Any}    data The operation data.
   * @return {Promise}
   */
  _singleOperationTransaction(name, data) {
    return this.batch(batch => batch[name](data))
      .catch(this._handleError(name))
      .then(res => {
        if (res.errors.length > 0) {
          throw res.errors[0];
        }
        // get() and list() expose their result directly, while clear(),
        // create(), update() and delete() put them in a `data` propertty.
        return res.result && "data" in res.result ? res.result.data : res.result;
      });
  }

  /**
   * Deletes every records in the current collection.
   *
   * @return {Promise}
   */
  clear() {
    return this._singleOperationTransaction("clear");
  }

  /**
   * Adds a record to the IndexedDB database.
   *
   * Note: An id value is required.
   *
   * @param  {Object} record The record object, including an id.
   * @return {Promise}
   */
  create(record) {
    return this._singleOperationTransaction("create", record);
  }

  /**
   * Updates a record from the IndexedDB database.
   *
   * @param  {Object} record
   * @return {Promise}
   */
  update(record) {
    return this._singleOperationTransaction("update", record);
  }

  /**
   * Deletes a record from the IndexedDB database.
   *
   * @param  {String} id The record id.
   * @return {Promise}
   */
  delete(id) {
    return this._singleOperationTransaction("delete", id);
  }

  /**
   * Retrieve a record by its primary key from the IndexedDB database.
   *
   * @param  {String} id The record id.
   * @return {Promise}
   */
  get(id) {
    return this._singleOperationTransaction("get", id);
  }

  /**
   * Lists all records from the IndexedDB database.
   *
   * @return {Promise}
   */
  list() {
    return this._singleOperationTransaction("list");
  }

  /**
   * Store the lastModified value into metadata store.
   *
   * @param  {Number}  lastModified
   * @return {Promise}
   */
  saveLastModified(lastModified) {
    var value = parseInt(lastModified, 10);
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite", "__meta__");
        store.put({name: "lastModified", value: value});
        transaction.onerror = event => reject(event.target.error);
        transaction.oncomplete = event => resolve(value);
      });
    });
  }

  /**
   * Retrieve saved lastModified value.
   *
   * @return {Promise}
   */
  getLastModified() {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare(undefined, "__meta__");
        const request = store.get("lastModified");
        transaction.onerror = event => reject(event.target.error);
        transaction.oncomplete = event => {
          resolve(request.result && request.result.value || null);
        };
      });
    });
  }
}
