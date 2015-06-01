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
      var request = indexedDB.open(this.name, 2);
      request.onupgradeneeded = event => {
        const store = event.target.result.createObjectStore(this.name, {
          keyPath: "id"
        });
        // Primary key (UUID)
        store.createIndex("id", "id", { unique: true });
        // Local record status ("synced", "created", "updated", "deleted")
        store.createIndex("_status", "_status");
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
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = event => {
          resolve({
            data: [],
            permissions: {}
          });
        };
      });
    });
  }

  _create(record) {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite");
        const newRecord = Object.assign({}, record, {
          id: uuid4(),
          _status: "created"
        });
        store.add(newRecord);
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = event => {
          resolve({
            data: newRecord,
            permissions: {}
          });
        };
      });
    });
  }

  _update(record) {
    return this.open().then(() => {
      return this.get(record.id).then(_ => {
        return new Promise((resolve, reject) => {
          const {transaction, store} = this.prepare("readwrite");
          const updatedRecord = Object.assign({}, record, {
            _status: record._status === "deleted" ? "deleted" : "updated"
          });
          const request = store.put(updatedRecord);
          transaction.onerror = event => reject(new Error(event.target.error));
          transaction.oncomplete = event => {
            resolve({
              data: Object.assign({}, updatedRecord, {id: request.result}),
              permissions: {}
            });
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

  get(id, options={includeDeleted: false}) {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare();
        const request = store.get(id);
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = event => {
          if (!request.result ||
             (!options.includeDeleted && request.result._status === "deleted"))
            return reject(new Error(`Record with id=${id} not found.`));
          resolve({
            data: request.result,
            permissions: {}
          });
        };
      });
    });
  }

  delete(id, options={virtual: true}) {
    return this.open().then(() => {
      // Ensure the record actually exists.
      return this.get(id).then(result => {
        if (options.virtual) {
          return this._update(Object.assign({}, result.data, {
            _status: "deleted"
          }));
        }
        return new Promise((resolve, reject) => {
          const {transaction, store} = this.prepare("readwrite");
          store.delete(id);
          transaction.onerror = event => reject(new Error(event.target.error));
          transaction.oncomplete = event => {
            resolve({
              data: { id: id },
              permissions: {}
            });
          };
        });
      });
    });
  }

  list(params={}, options={includeDeleted: false}) {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const results = [];
        const {transaction, store} = this.prepare();
        const request = store.openCursor();
        request.onsuccess = function(event) {
          var cursor = event.target.result;
          if (cursor) {
            if (options.includeDeleted || cursor.value._status !== "deleted")
              results.push(cursor.value);
            cursor.continue();
          }
        };
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = event => {
          resolve({
            data: results,
            permissions: {}
          });
        };
      });
    });
  }

  sync() {
    return this.api.request();
  }
}
