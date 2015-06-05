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

  fetchLocalChanges() {
    // TODO: perform a filtering query on the _status field
    return this.list().then(res => {
      return res.data.reduce((acc, record) => {
        if (record._status !== "synced")
          acc[record._status].push(record);
        return acc;
      }, {created: [], updated: [], deleted: []});
    });
  }

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

  importChangesLocally(changes, options={mode: Collection.strategy.SERVER_WINS}) {
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
        .catch(_ => {
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
            processed.push(change.id);
            localImportResult.conflicts.push(change);
            return this.handleConflict(res.data, change, options.mode);
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
    })).then(_ => localImportResult);
  }

  publishChanges(changes, headers={}) {
    return Promise.all([
      this.api.batch(this.name, "create", changes.created, headers),
      this.api.batch(this.name, "update", changes.updated, headers),
      this.api.batch(this.name, "delete", changes.deleted, headers),
    ]).then(...published => {
      return {
        created: published[0],
        updated: published[1],
        deleted: published[2],
      };
    });
  }

  sync(options={mode: Collection.strategy.SERVER_WINS, headers: {}}) {
    // TODO: lock all write operations while syncing to prevent races?
    var lastModified, report;
    // First fetch the remote changes since last synchronization
    return this.api.fetchChangesSince(this.name, this.lastModified, options)
      // Reflect these changes locally
      .then(res => {
        // Temporarily store server's lastModified value for further use
        lastModified = res.lastModified;
        // Import changes
        return this.importChangesLocally(res.changes);
      })
      // On successful import completion, update lastModified value and forward
      // import report
      .then(imported => {
        this._lastModified = lastModified;
        report = imported;
      })
      // Retrieve local changes
      .then(_ => this.fetchLocalChanges())
      // Publish them remotely
      .then(localChanges => this.publishChanges(localChanges, options.headers))
      // resolve with local import report
      .then(_ => report);
  }
}
