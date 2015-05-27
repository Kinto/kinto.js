"use strict";

import { v4 as uuid4 } from "uuid";
import { attachFakeIDBSymbolsTo } from "./utils";

attachFakeIDBSymbolsTo(typeof global === "object" ? global : window);

export default class Collection {
  constructor(collName) {
    this._collName = collName;
    this._db;
  }

  get name() {
    return this._collName;
  }

  init() {
    return new Promise((resolve, reject) => {
      var request = indexedDB.open(this._collName, 1);
      request.onupgradeneeded = event => {
        var store = event.target.result.createObjectStore(this._collName, {
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

  transaction(mode) {
    return this._db
      .transaction([this._collName], mode)
      .objectStore(this._collName);
  }

  clear() {
    return new Promise((resolve, reject) => {
      var request = this.transaction("readwrite").clear();
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

  save(record) {
    return new Promise((resolve, reject) => {
      var transaction = this.transaction("readwrite");
      if (typeof(record) !== "object") {
        return reject(new Error('Record is not an object.'));
      }
      var request;
      if (!record.id) {
        request = transaction.add(Object.assign({}, record, {id: uuid4()}));
      } else {
        request = transaction.put(record);
      }
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
  }

  get(id) {
    return new Promise((resolve, reject) => {
      var request = this.transaction().get(id);
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
        var request = this.transaction("readwrite").delete(id);
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
      var request = this.transaction().openCursor();
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
