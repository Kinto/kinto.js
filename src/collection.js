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
        // XXX reject with proper error
        let err = new Error('Transaction error: ' + event.target.error);
        console.log(event)
        reject(err);
      };

      if (typeof(record) !== 'object') {
        let err = new Error('Record is not an object.');
        return reject(err);
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
}
