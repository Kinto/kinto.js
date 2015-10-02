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
      request.onerror = event => reject(new Error(event.target.error));
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
      request.onerror = event => reject(new Error(event.target.error));
      request.onsuccess = function(event) {
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

  _schedule(type, data) {
    const operation = {type, data};
    this._operations.push(operation);
    return operation;
  }

  /**
   * Clears the current store.
   *
   * @return {Object} An object describing the operation.
   */
  clear() {
    return this._schedule("clear");
  }

  /**
   * Adds a record to the store.
   *
   * @return {Object} An object describing the operation.
   */
  create(data) {
    return this._schedule("create", data);
  }

  /**
   * Updates a record from the store.
   *
   * @return {Object} An object describing the operation.
   */
  update(data) {
    return this._schedule("update", data);
  }

  /**
   * Deletes a record from the store.
   *
   * @return {Object} An object describing the operation.
   */
  delete(data) {
    return this._schedule("delete", data);
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
          this._operations.forEach(operation => {
            const storeMethod = Batch.BATCH_STORE_METHODS[operation.type];
            try {
              this._store[storeMethod](operation.data);
            } catch(error) {
              this._errors.push({type: "error", error, operation});
            }
          });
          this._transaction.onerror = event => {
            resolve({
              result,
              operations: this._operations,
              errors: this._errors.concat({
                type: "error",
                error: event.target.error
              })
            });
          };
          this._transaction.onabort = event => {
            resolve({
              result,
              operations: this._operations,
              errors: this._errors,
            });
          };
          this._transaction.oncomplete = event => {
            resolve({
              result,
              operations: this._operations,
              errors: this._errors,
            });
          };
        });
      })
      .catch(err => ({
        result: undefined,
        operations: this._operations,
        errors: this._errors.concat(err),
      }));
  }
}

/**
 * IndexedDB adapter.
 */
export default class IDB extends BaseAdapter {
  /**
   * Constructor.
   *
   * @param  {String} dbname The database nale.
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

  _handleError(method) {
    return err => {
      const error = new Error(method + "() " + err.message);
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
   * Deletes every records in the current collection.
   *
   * @return {Promise}
   */
  clear() {
    return this.batch(batch => batch.clear())
      .then(res => {
        if (res.errors.length > 0) {
          throw res.errors[0].error;
        }
      })
      .catch(this._handleError("clear"));
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
    return this.batch(batch => batch.create(record))
      .then(res => {
        if (res.errors.length > 0) {
          throw res.errors[0].error;
        }
        return res.result.data;
      })
      .catch(this._handleError("create"));
  }

  /**
   * Updates a record from the IndexedDB database.
   *
   * @param  {Object} record
   * @return {Promise}
   */
  update(record) {
    return this.batch(batch => batch.update(record))
      .then(res => {
        if (res.errors.length > 0) {
          throw res.errors[0].error;
        }
        return res.result.data;
      })
      .catch(this._handleError("update"));
  }

  /**
   * Retrieve a record by its primary key from the IndexedDB database.
   *
   * @param  {String} id The record id.
   * @return {Promise}
   */
  get(id) {
    return this.batch(batch => batch.get(id))
      .then(res => {
        if (res.errors.length > 0) {
          throw res.errors[0];
        }
        return res.result;
      })
      .catch(this._handleError("get"));
  }

  /**
   * Deletes a record from the IndexedDB database.
   *
   * @param  {String} id The record id.
   * @return {Promise}
   */
  delete(id) {
    return this.batch(batch => batch.delete(id))
      .then(res => {
        if (res.errors.length > 0) {
          throw res.errors[0].error;
        }
        return res.result.data;
      })
      .catch(this._handleError("delete"));
  }

  /**
   * Lists all records from the IndexedDB database.
   *
   * @return {Promise}
   */
  list() {
    return this.batch(batch => batch.list())
      .then(res => {
        if (res.errors.length > 0) {
          throw res.errors[0];
        }
        return res.result;
      })
      .catch(this._handleError("list"));
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
