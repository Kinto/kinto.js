"use strict";

import { v4 as uuid4 } from "uuid";
import { attachFakeIDBSymbolsTo } from "./utils";

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
    }
  }

  /**
   * Ensures a connection to the local database has been opened.
   *
   * @return {Promise}
   */
  open() {
    if (this._db)
      return Promise.resolve(this);
    return new Promise((resolve, reject) => {
      var request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = event => {
        const store = event.target.result.createObjectStore(this.name, {
          keyPath: "id"
        });
        // Primary key (UUID)
        store.createIndex("id", "id", { unique: true });
        // Local record status ("synced", "created", "updated", "deleted")
        store.createIndex("_status", "_status");
        // Last modified field
        store.createIndex("last_modified", "last_modified");
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
    });
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
    });
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
    });
  }

  /**
   * Retrieve a record to the local database.
   *
   * @param  {Object} record
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
    });
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
      return this.get(id).then(result => {
        if (options.virtual) {
          return this.update(Object.assign({}, result.data, {
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

  /**
   * Fetches a list of unsynced records from the local database.
   *
   * @param  {Object} record
   * @param  {Object} options
   * @return {Prmise}
   */
  fetchLocalChanges() {
    // TODO: perform a filtering query on the _status field
    return this.list().then(res => {
      return res.data.filter(r => r._status !== "synced");
    });
  }

  // TODO Discard automatic conflict handling on import
  //      Instead, list conflicts so the developer handles them by hand
  handleConflict(local, remote, syncStrategy) {
    // Server wins
    if (syncStrategy === Collection.strategy.SERVER_WINS)
      return this.update(remote, {synced: true});

    // Client wins
    if (syncStrategy === Collection.strategy.CLIENT_WINS)
      return this.update(local, {synced: true});

    // User provided conflict resolution strategy
    if (typeof syncStrategy === "function") {
      let resolution = syncStrategy(local, remote);
      if (typeof(resolution) !== "object")
        throw new Error("Conflict resolution function must return an object");
      return this.update(resolution, {synced: true});
    }

    throw new Error("Unsupported sync mode.");
  }

  _importChanges(changes) {
    const processed = [];
    const localImportResult = {
      created:   [],
      updated:   [],
      deleted:   [],
      conflicts: [],
    };
    return Promise.all(changes.map(change => {
      // Retrieve local record matching this change
      return this.get(change.id)
        // No matching local record found; that's a new addition
        .catch(err => {
          if (!(/not found/i).test(err.message))
            throw err;
          return this.create(change, {synced: true}).then(res => {
            // Avoid creating deletions :)
            if (change.deleted) return res;
            processed.push(res.data.id);
            localImportResult.created.push(res.data);
            return res;
          });
        })
        // Matching local record found
        .then(res => {
          // Check for conflict
          if (res.data._status !== "synced") {
            // XXX we could compare the two object, if no diff, skip
            processed.push(change.id);
            localImportResult.conflicts.push(change);
            return Promise.resolve({data: change});
          } else if (change.deleted) {
            return this.delete(change.id, {virtual: false}).then(res => {
              processed.push(change.id);
              localImportResult.deleted.push(res.data);
              return res;
            });
          } else if (processed.indexOf(change.id) === -1) {
            return this.update(change, {synced: true}).then(res => {
              processed.push(change.id);
              localImportResult.updated.push(res.data);
              return res;
            });
          }
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
        return this._importChanges(res.changes);
      })
      // On successful import completion, update lastModified value and forward
      // import result
      .then(imported => {
        this._lastModified = lastModified;
        return imported;
      });
  }

  /**
   * Publish local changes to the remote server.
   *
   * @param  {Options} options
   * @return {Promise}
   */
  pushChanges(options) {
    // Fetch local changes
    return this.fetchLocalChanges()
      // Publish them remotely
      .then(localChanges => {
        return this.api.batch(this.name, localChanges, options.headers, {
          safe: options.mode === Collection.SERVER_WINS
        })
      }).then(res => {
        // TODO: reduce to {created: …, updated: …, etc…}
        return res;
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
    var imported, exported;
    return this.pullChanges(options)
      .then(res => {
        imported = res;
        return this.pushChanges(options);
      })
      .then(res => {
        exported = res;
        return {imported, exported};
      });
  }
}
