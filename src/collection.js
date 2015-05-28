"use strict";

import { v4 as uuid4 } from "uuid";
import { attachFakeIDBSymbolsTo } from "./utils";

attachFakeIDBSymbolsTo(typeof global === "object" ? global : window);

export default class Collection {
  constructor(name, api) {
    this._name = name;
    this._db;
    this.api = api;
  }

  get name() {
    return this._name;
  }

  open() {
    if (this._db)
      return Promise.resolve(this);
    return new Promise((resolve, reject) => {
      var request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = event => {
        var store = event.target.result.createObjectStore(this.name, {
          keyPath: "id"
        });
        store.createIndex("id", "id", { unique: true });
      };
      request.onerror = event => {
        reject(event.error);
      };
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
   * @param {String} mode  Transaction mode ("readwrite" or undefined)
   */
  prepare(mode) {
    const transaction = this._db.transaction([this.name], mode);
    const store = transaction.objectStore(this.name);
    return {transaction, store};
  }

  clear() {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite");
        store.clear();
        transaction.oncomplete = function(event) {
          resolve({
            data: [],
            permissions: {}
          });
        };
        transaction.onerror = function(event) {
          reject(new Error(event.target.error));
        };
      });
    });
  }

  _create(record) {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        var {transaction, store} = this.prepare("readwrite");
        var newRecord = Object.assign({}, record, {id: uuid4()});
        store.add(newRecord);
        transaction.oncomplete = function(event) {
          resolve({
            data: newRecord,
            permissions: {}
          });
        };
        transaction.onerror = function(event) {
          reject(new Error(event.target.error));
        };
      });
    });
  }

  _update(record) {
    return this.open().then(() => {
      return this.get(record.id).then(_ => {
        return new Promise((resolve, reject) => {
          var {transaction, store} = this.prepare("readwrite");
          var request = store.put(record);
          transaction.oncomplete = function(event) {
            resolve({
              data: Object.assign({}, record, {id: request.result}),
              permissions: {}
            });
          };
          transaction.onerror = function(event) {
            reject(new Error(event.target.error));
          };
        });
      });
    });
  }

  save(record) {
    if (typeof(record) !== "object")
      return Promise.reject(new Error('Record is not an object.'));
    return this.open().then(() => {
      return record.id ? this._update(record) : this._create(record);
    });
  }

  get(id) {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        var {transaction, store} = this.prepare();
        var request = store.get(id);
        transaction.oncomplete = function(event) {
          if (!request.result)
            return reject(new Error(`Record with id=${id} not found.`));
          resolve({
            data: request.result,
            permissions: {}
          });
        };
        transaction.onerror = function(event) {
          reject(new Error(event.target.error));
        };
      });
    });
  }

  delete(id) {
    return this.open().then(() => {
      // Ensure the record actually exists.
      return this.get(id).then(result => {
        return new Promise((resolve, reject) => {
          const {transaction, store} = this.prepare("readwrite");
          store.delete(id);
          transaction.oncomplete = function(event) {
            resolve({
              data: { id: id, deleted: true },
              permissions: {}
            });
          };
          transaction.onerror = function(event) {
            reject(new Error(event.target.error));
          };
        });
      });
    });
  }

  list() {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        var results = [];
        const {transaction, store} = this.prepare();
        var request = store.openCursor();
        request.onsuccess = function(event) {
          var cursor = event.target.result;
          if (cursor) {
            results.push(cursor.value);
            cursor.continue();
          }
        };
        transaction.oncomplete = function(event) {
          resolve({
            data: results,
            permissions: {}
          });
        };
        transaction.onerror = function(event) {
          reject(new Error(event.target.error));
        };
      });
    });
  }

  sync() {
    return this.api.request();
  }
}
