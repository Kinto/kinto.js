"use strict";

import { attachFakeIDBSymbolsTo } from "./../utils";

attachFakeIDBSymbolsTo(typeof global === "object" ? global : window);

export default class IDB {
  constructor(bucket, name) {
    this._bucket = bucket;
    this._name = name;
    this._db = null;
  }

  get name() {
    return this._name;
  }

  get bucket() {
    return this._bucket;
  }

  get dbname() {
    return `${this.bucket}/${this.name}`;
  }

  _handleError(method) {
    return err => {throw new Error(method + "() " + err.message)};
  }

  /**
   * Ensures a connection to the IndexedDB database has been opened.
   *
   * @return {Promise}
   */
  open() {
    if (this._db)
      return Promise.resolve(this);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbname, 1);
      request.onupgradeneeded = event => {
        // DB object
        const db = event.target.result;
        // Main collection store
        const collStore = db.createObjectStore(this.dbname, {
          keyPath: "id"
        });
        // Primary key (UUID)
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
   * @param {String}      mode  Transaction mode ("readwrite" or undefined)
   * @param {String|null} name  Store name (defaults to coll name)
   */
  prepare(mode=undefined, name=null) {
    const storeName = name || this.dbname;
    const transaction = this._db.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);
    return {transaction, store};
  }

  /**
   * Deletes every records in the current collection.
   *
   * @return {Promise}
   */
  clear() {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite");
        store.clear();
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = () => resolve();
      });
    }).catch(this._handleError("clear"));
  }

  /**
   * Adds a record to the IndexedDB database.
   *
   * @param  {Object} record
   * @return {Promise}
   */
  create(record) {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite");
        store.add(record);
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = () => resolve(record);
      });
    }).catch(this._handleError("create"));
  }

  /**
   * Updates a record from the IndexedDB database.
   *
   * @param  {Object} record
   * @return {Promise}
   */
  update(record) {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite");
        const request = store.put(record);
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = () => resolve(record);
      });
    }).catch(this._handleError("update"));
  }

  /**
   * Retrieve a record by its primary key from the IndexedDB database.
   *
   * @param  {String} id The record id.
   * @return {Promise}
   */
  get(id) {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare();
        const request = store.get(id);
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = () => resolve(request.result);
      });
    }).catch(this._handleError("get"));
  }

  /**
   * Deletes a record from the IndexedDB database.
   *
   * @param  {String} id The record id.
   * @return {Promise}
   */
  delete(id) {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite");
        store.delete(id);
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = () => resolve(id);
      });
    }).catch(this._handleError("delete"));
  }

  /**
   * Lists all records from the IndexedDB database.
   *
   * @return {Promise}
   */
  list() {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const results = [];
        const {transaction, store} = this.prepare();
        const request = store.openCursor();
        request.onsuccess = function(event) {
          var cursor = event.target.result;
          if (cursor) {
            results.push(cursor.value);
            cursor.continue();
          }
        };
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = event => resolve(results);
      });
    }).catch(this._handleError("list"));
  }

  /**
   * Store the lastModified value into metadata store.
   *
   * @param  {Number}  lastModified
   * @param  {Object}  options
   * @return {Promise}
   */
  saveLastModified(lastModified) {
    var value = parseInt(lastModified, 10);
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite", "__meta__");
        const request = store.put({name: "lastModified", value: value});
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
          resolve(request.result && request.result.value || null)
        };
      });
    });
  }
}
