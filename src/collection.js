"use strict";

import { v4 as uuid4 } from "uuid";
import { attachFakeIDBSymbolsTo } from "./utils";

attachFakeIDBSymbolsTo(typeof global === "object" ? global : window);

// TODO:  To determine if a transaction has completed successfully,
// listen to the transaction’s complete event rather than the
// IDBObjectStore.add request’s success event, because the transaction
// may still fail after the success event fires.

export default class Collection {
  constructor(name) {
    this._name = name;
    this._db;
  }

  get name() {
    return this._name;
  }

  init() {
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

  getStore(mode) {
    return this._db
      .transaction([this.name], mode)
      .objectStore(this.name);
  }

  clear() {
    return new Promise((resolve, reject) => {
      var request = this.getStore("readwrite").clear();
      request.onsuccess = function(event) {
        resolve({
          data: [],
          permissions: {}
        });
      };
      request.onerror = function(event) {
        reject(new Error(event.target.error));
      };
    });
  }

  _create(record) {
    return new Promise((resolve, reject) => {
      var transaction = this.getStore("readwrite");
      var newRecord = Object.assign({}, record, {id: uuid4()});
      var request = transaction.add(newRecord);
      request.onsuccess = function(event) {
        resolve({
          data: newRecord,
          permissions: {}
        });
      };
      request.onerror = function(event) {
        reject(new Error(event.target.error));
      };
    });
  }

  _update(record) {
    return this.get(record.id).then(_ => {
      return new Promise((resolve, reject) => {
        var transaction = this.getStore("readwrite");
        var request = transaction.put(record);
        request.onsuccess = function(event) {
          resolve({
            data: Object.assign({}, record, {id: event.target.result}),
            permissions: {}
          });
        };
        request.onerror = function(event) {
          reject(new Error(event.target.error));
        };
      });
    });
  }

  save(record) {
    if (typeof(record) !== "object")
      return Promise.reject(new Error('Record is not an object.'));
    return record.id ? this._update(record) : this._create(record);
  }

  get(id) {
    return new Promise((resolve, reject) => {
      var request = this.getStore().get(id);
      request.onsuccess = function(event) {
        if (!request.result)
          return reject(new Error(`Record with id=${id} not found.`));
        resolve({
          data: request.result,
          permissions: {}
        });
      };
      request.onerror = function(event) {
        reject(new Error(event.target.error));
      };
    });
  }

  delete(id) {
    // Ensure the record actually exists.
    return this.get(id).then(result => {
      return new Promise((resolve, reject) => {
        var request = this.getStore("readwrite").delete(id);
        request.onsuccess = function(event) {
          resolve({
            data: { id: id, deleted: true },
            permissions: {}
          });
        };
        request.onerror = function(event) {
          reject(new Error(event.target.error));
        };
      })
    });
  }

  list() {
    return new Promise((resolve, reject) => {
      var results = [];
      var request = this.getStore().openCursor();
      request.onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve({
            data: results,
            permissions: {}
          });
        }
      };
      request.onerror = function(event) {
        reject(new Error(event.target.error));
      };
    });
  }
}
