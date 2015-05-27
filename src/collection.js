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
      var dbOpenRequest = indexedDB.open(this._collName, 1);
      dbOpenRequest.onupgradeneeded = event => {
        var store = event.target.result.createObjectStore(this._collName, {
          keyPath: "id"
        });
        store.createIndex("id", "id", { unique: true });
      };
      dbOpenRequest.onerror = event => {
        reject(event.error);
      };
      dbOpenRequest.onsuccess = event => {
        this._db = event.target.result;
        resolve(this);
      };
    });
  }

  save(record) {
    return new Promise((resolve, reject) => {
      var transaction = this._db.transaction([this._collName], "readwrite");
      transaction.oncomplete = function(event) {
        resolve({
          data: record,
          permissions: {}
        });
      };
      transaction.onerror = function(event) {
        reject(new Error(event.target.error));
      };

      if (typeof(record) !== "object") {
        return reject(new Error('Record is not an object.'));
      }

      let store = transaction.objectStore(this._collName);
      if (!record.id) {
        record = Object.assign({}, record, {id: uuid4()});
        store.add(record);
      }
      else {
        store.put(record);
      }
    });
  }

  get(id) {
    return new Promise((resolve, reject) => {
      var request = this._db
        .transaction([this._collName])
        .objectStore(this._collName)
        .get(id);
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
        var request = this._db
          .transaction([this._collName], "readwrite")
          .objectStore(this._collName)
          .delete(id);
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
}
