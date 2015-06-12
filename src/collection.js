"use strict";

import { v4 as uuid4 } from "uuid";
import deepEquals from "deep-eql";

import { attachFakeIDBSymbolsTo } from "./utils";
import { cleanRecord } from "./api";

attachFakeIDBSymbolsTo(typeof global === "object" ? global : window);

export default class Collection {
  constructor(name, api) {
    this._name = name;
    this._db;
    this.api = api;
    this._lastModified = null;
  }

  get name() {
    return this._name;
  }

  get lastModified() {
    return this._lastModified;
  }

  static get strategy() {
    return {
      CLIENT_WINS: "client_wins",
      SERVER_WINS: "server_wins",
      FAIL:        "fail",
    }
  }

  _handleError(method) {
    return err => {throw new Error(method + "() " + err.message)}
  }

  /**
   * Ensures a connection to the local database has been opened.
   *
   * @return {Promise}
   */
  open(options={checkLastModified: true}) {
    if (this._db)
      return Promise.resolve(this);
    const promise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = event => {
        // DB object
        const db = event.target.result;
        // Main collection store
        const collStore = db.createObjectStore(this.name, {
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
      request.onerror = event => reject(event.error);
      request.onsuccess = event => {
        this._db = event.target.result;
        resolve(this);
      };
    });
    if (options.checkLastModified) {
      // Fetch and reflect collection lastModified value locally
      return promise
      .then(_ => this.getLastModified())
      .then(lastModified => this._lastModified = lastModified);
    } else {
      return promise;
    }
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
    const storeName = name || this.name;
    const transaction = this._db.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);
    return {transaction, store};
  }

  /**
   * Clears current collection.
   *
   * @return {Promise}
   */
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
    }).catch(this._handleError("clear"));
  }

  /**
   * Adds a record to the local database.
   *
   * @param  {Object} record
   * @param  {Object} options
   * @return {Promise}
   */
  create(record, options={synced: false}) {
    return this.open().then(() => {
      if (typeof(record) !== "object")
        return Promise.reject(new Error('Record is not an object.'));
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite");
        const newRecord = Object.assign({}, record, {
          id:      options.synced ? record.id : uuid4(),
          _status: options.synced ? "synced" : "created"
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
    }).catch(this._handleError("create"));
  }

  /**
   * Updates a record from the local database.
   *
   * @param  {Object} record
   * @param  {Object} options
   * @return {Promise}
   */
  update(record, options={synced: false}) {
    return this.open().then(() => {
      if (typeof(record) !== "object")
        return Promise.reject(new Error("Record is not an object."));
      return this.get(record.id).then(_ => {
        return new Promise((resolve, reject) => {
          var newStatus = "updated";
          if (record._status === "deleted") {
            newStatus = "deleted";
          } else if (options.synced) {
            newStatus = "synced";
          }
          const {transaction, store} = this.prepare("readwrite");
          const updatedRecord = Object.assign({}, record, {_status: newStatus});
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
    }).catch(this._handleError("update"));
  }

  /**
   * Retrieve a record by its id from the local database.
   *
   * @param  {String} id
   * @param  {Object} options
   * @return {Promise}
   */
  get(id, options={includeDeleted: false}) {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare();
        const request = store.get(id);
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = event => {
          if (!request.result ||
             (!options.includeDeleted && request.result._status === "deleted")) {
            reject(new Error(`Record with id=${id} not found.`));
          } else {
            resolve({
              data: request.result,
              permissions: {}
            });
          }
        };
      });
    }).catch(this._handleError("get"));
  }

  /**
   * Deletes a record from the local database.
   *
   * @param  {String} id
   * @param  {Object} options
   * @return {Promise}
   */
  delete(id, options={virtual: true}) {
    return this.open().then(() => {
      // Ensure the record actually exists.
      return this.get(id, {includeDeleted: true}).then(res => {
        if (options.virtual) {
          if (res.data._status === "deleted") {
            // Record is already deleted
            return Promise.resolve({
              data: { id: id },
              permissions: {}
            });
          } else {
            return this.update(Object.assign({}, res.data, {
              _status: "deleted"
            }));
          }
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
    }).catch(this._handleError("delete"));
  }

  /**
   * Lists records from the local database.
   *
   * @param  {Object} params
   * @param  {Object} options
   * @return {Promise}
   */
  list(params={}, options={includeDeleted: false}) {
    return this.open().then(() => {
      return new Promise((resolve, reject) => {
        const results = [];
        const {transaction, store} = this.prepare();
        const request = store.openCursor();
        request.onsuccess = function(event) {
          var cursor = event.target.result;
          if (cursor) {
            if (options.includeDeleted || cursor.value._status !== "deleted") {
              results.push(cursor.value);
            }
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
    }).catch(this._handleError("list"));
  }

  /**
   * Import changes into the local database.
   *
   * @param  {Array} changes
   * @return {Promise}
   */
  import(changes) {
    const localImportResult = {
      created:   [],
      updated:   [],
      deleted:   [],
      conflicts: [],
    };
    return Promise.all(changes.map(change => {
      // Retrieve local record matching this change
      return this.get(change.id, {includeDeleted: true})
        // Matching local record found
        .then(res => {
          // Check for conflicts
          if (res.data._status !== "synced") {
            if (res.data._status === "deleted") {
              // Locally deleted, unsynced but scheduled for remote deletion.
              return Promise.resolve({});
            } else if (deepEquals(cleanRecord(res.data), cleanRecord(change))) {
              // If records are identical, import anyway, so we bump the
              // local last_modified value from the server and set record
              // status to "synced".
              return this.update(change, {synced: true}).then(res => {
                localImportResult.updated.push(res.data);
              });
            } else {
              localImportResult.conflicts.push({
                local: res.data,
                remote: change,
              });
              return Promise.resolve({});
            }
          } else if (change.deleted) {
            return this.delete(change.id, {virtual: false}).then(res => {
              localImportResult.deleted.push(res.data);
            });
          } else {
            return this.update(change, {synced: true}).then(res => {
              localImportResult.updated.push(res.data);
            });
          }
        })
        .catch(err => {
          if (!(/not found/i).test(err.message))
            throw err;
          // Avoid recreating records deleted remotely :)
          if (change.deleted)
            return {};
          return this.create(change, {synced: true}).then(res => {
            localImportResult.created.push(res.data);
            return res;
          });
        });
    })).then(_ => {
      if (localImportResult.conflicts.length > 0) {
        return Promise.reject(localImportResult);
      } else {
        return Promise.resolve(localImportResult);
      }
    });
  }

  /**
   * Store the lastModified value into collection's metadata store.
   *
   * @param  {Number}  lastModified
   * @param  {Object}  options
   * @return {Promise}
   */
  saveLastModified(lastModified) {
    return this.open({checkLastModified: false}).then(() => {
      return new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite", "__meta__");
        const request = store.put({name: "lastModified", value: lastModified});
        transaction.onerror = event => reject(event.target.error);
        transaction.oncomplete = event => {
          // update locally cached property
          this._lastModified = lastModified;
          resolve(lastModified);
        };
      });
    });
  }

  /**
   * Retrieve saved collection's lastModified value.
   *
   * @return {Promise}
   */

  getLastModified() {
    return this.open({checkLastModified: false}).then(() => {
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

  /**
   * Import remote changes to the local database. Will reject on encountered
   * conflicts.
   *
   * @param  {Options} options
   * @return {Promise}
   */
  pullChanges(options) {
    var lastModified, imported;
    // First fetch remote changes from the server
    return this.api.fetchChangesSince(this.name, this.lastModified, options)
      // Reflect these changes locally
      .then(res => {
        // Temporarily store server's lastModified value for further use
        lastModified = res.lastModified;
        // Import changes
        return this.import(res.changes);
      })
      // On successful import completion, update lastModified value
      .then(result => {
        imported = result;
        return this.saveLastModified(lastModified);
      })
      // Resolve with import report
      .then(_ => imported);
  }

  /**
   * Publish local changes to the remote server.
   *
   * @param  {Options} options
   * @return {Promise}
   */
  pushChanges(options={headers: {}}) {
    var exported;
    // Fetch local changes
    return this.list({}, {includeDeleted: true})
      .then(res => {
        return res.data.reduce((acc, record) => {
          if (record._status === "deleted" && !record.last_modified)
            acc.toDelete.push(record);
          else if (record._status !== "synced")
            acc.toSync.push(record);
          return acc;
        }, {toDelete: [], toSync: []});
      })
      .then(operations => {
        return Promise.all([
          // Delete never synced records marked for deletion
          Promise.all(operations.toDelete.map(record => {
            return this.delete(record.id, {virtual: false});
          })),
          // Send batch update requests
          this.api.batch(this.name, operations.toSync, options.headers, {
            safe: options.mode === Collection.SERVER_WINS
          })
        ]);
      })
      .then(res => res[1])
      // Update published local records status to "synced"
      .then(result => {
        exported = result;
        return Promise.all(exported.published.map(record => {
          if (record.deleted) {
            return this.delete(record.id, {virtual: false}).then(res => {
              // Amend result data with the deleted attribute set
              return {data: {id: res.data.id, deleted: true}};
            });
          } else {
            return this.update(record, {synced: true});
          }
        }));
      }).
      then(results => {
        exported.published = results.map(res => res.data);
        return exported;
      });
  }


  /**
   * Synchronize remote and local data. The promise will resolve with two lists:
   * - local imports
   * - remote exports
   * The promise will reject if conflicts have been encountered, with the same
   * result.
   *
   * @param  {Object} options options
   * @return {Promise}
   */
  sync(options={mode: Collection.strategy.FAIL, headers: {}}) {
    // TODO rename options.mode to options.strategy
    // TODO ensure we always return the same result data struct (imported, exported)
    var imported, exported;
    return this.pullChanges(options)
      .then(res => {
        imported = res;
        return this.pushChanges(options);
      })
      .then(res => {
        exported = res;
        return this.pullChanges(options);
      })
      .then(_ => {
        return {imported, exported};
      });
  }
}
