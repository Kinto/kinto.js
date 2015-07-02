"use strict";

import { v4 as uuid4 } from "uuid";
import deepEquals from "deep-eql";

import { attachFakeIDBSymbolsTo } from "./utils";
import { cleanRecord } from "./api";

attachFakeIDBSymbolsTo(typeof global === "object" ? global : window);

export class SyncResultObject {
  static get defaults() {
    return {
      ok:           true,
      lastModified: null,
      errors:       [],
      created:      [],
      updated:      [],
      deleted:      [],
      published:    [],
      conflicts:    [],
      skipped:      [],
    };
  }

  constructor() {
    Object.assign(this, SyncResultObject.defaults);
  }

  add(type, entries) {
    if (!Array.isArray(this[type]))
      return;
    this[type] = this[type].concat(entries);
    this.ok = this.errors.length + this.conflicts.length === 0
  }
}

export default class Collection {

  /**
   * Ensures a connection to the local database has been opened.
   *
   * @param {String}      bucket  Bucket identifier.
   * @param {String}      name    Collection name.
   * @param {Api}         api     Reference to Api instance.
   *
   * @return {Promise}
   */
  constructor(bucket, name, api) {
    this._bucket = bucket;
    this._name = name;
    this._db;
    this.api = api;
    this._lastModified = null;
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

  get lastModified() {
    return this._lastModified;
  }

  static get strategy() {
    return {
      CLIENT_WINS: "client_wins",
      SERVER_WINS: "server_wins",
      MANUAL:      "manual",
    }
  }

  _handleError(method) {
    return err => {
      throw new Error(method + "() " + err.message);
    };
  }

  /**
   * Ensures a connection to the local database has been opened.
   *
   * @return {Promise}
   */
  async open() {
    if (this._db)
      return this;
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
  async clear() {
    try {
      await this.open();
      return await new Promise((resolve, reject) => {
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
    } catch(err) {
      this._handleError("clear")(err);
    }
  }

  /**
   * Adds a record to the local database.
   *
   * Options:
   * - {Boolean} synced: Sets record status to "synced" (default: false)
   *
   * @param  {Object} record
   * @param  {Object} options
   * @return {Promise}
   */
  async create(record, options={synced: false}) {
    try {
      await this.open();
      if (typeof(record) !== "object")
        throw new Error('Record is not an object.');
      return await new Promise((resolve, reject) => {
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
    } catch(err) {
      this._handleError("create")(err);
    }
  }

  /**
   * Updates a record from the local database.
   *
   * Options:
   * - {Boolean} synced: Sets record status to "synced" (default: false)
   *
   * @param  {Object} record
   * @param  {Object} options
   * @return {Promise}
   */
  async update(record, options={synced: false}) {
    try {
      await this.open();
      if (typeof(record) !== "object")
        throw new Error("Record is not an object.");
      if (!record.id)
        throw new Error("Cannot update a record missing id.");
      await this.get(record.id);
      return await new Promise((resolve, reject) => {
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
    } catch(err) {
      this._handleError("update")(err);
    }
  }

  /**
   * Resolves a conflict, updating local record according to proposed
   * resolution — keeping remote record last_modified value as a reference for
   * further batch sending.
   *
   * @param  {Object} conflict   The conflict object.
   * @param  {Object} resolution The proposed record.
   * @return {Promise}
   */
  async resolve(conflict, resolution) {
    return this.update(Object.assign({}, resolution, {
      last_modified: conflict.remote.last_modified
    }));
  }

  /**
   * Retrieve a record by its id from the local database.
   *
   * @param  {String} id
   * @param  {Object} options
   * @return {Promise}
   */
  async get(id, options={includeDeleted: false}) {
    try {
      await this.open();
      return await new Promise((resolve, reject) => {
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
      })
    } catch(err) {
      this._handleError("get")(err);
    }
  }

  /**
   * Deletes a record from the local database.
   *
   * Options:
   * - {Boolean} virtual: When set to true, doesn't actually delete the record,
   *                      update its _status attribute to "deleted" instead.
   *
   * @param  {String} id
   * @param  {Object} options
   * @return {Promise}
   */
  async delete(id, options={virtual: true}) {
    const defaultReturnValue = {data: {id: id}, permissions: {}};
    try {
      await this.open();
      // Ensure the record actually exists.
      const res = await this.get(id, {includeDeleted: true});
      if (options.virtual) {
        if (res.data._status === "deleted") {
          // Record is already deleted
          return defaultReturnValue;
        } else {
          return await this.update(Object.assign({}, res.data, {
            _status: "deleted"
          }));
        }
      }
      return await new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite");
        store.delete(id);
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = event => resolve(defaultReturnValue);
      });
    } catch(err) {
      this._handleError("delete")(err);
    }
  }

  /**
   * Lists records from the local database.
   *
   * @param  {Object} params
   * @param  {Object} options
   * @return {Promise}
   */
  async list(params={}, options={includeDeleted: false}) {
    try {
      await this.open();
      return await new Promise((resolve, reject) => {
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
    } catch(err) {
      this._handleError("list")(err);
    }
  }

  /**
   * Import a single change into the local database.
   *
   * @param  {Object} change
   * @return {Promise}
   */
  async _importChange(change) {
    var res;
    try {
      res = await this.get(change.id, {includeDeleted: true});
    } catch(err) {
      // Unmatched local record
      if (!(/not found/i).test(err.message))
        return {type: "errors", data: err};
      // Not found locally but remote change is marked as deleted; skip to
      // avoid recreation.
      if (change.deleted)
        return {type: "skipped", data: change};
      return await this.create(change, {synced: true}).then(res => {
        return {type: "created", data: res.data};
      });
    }
    if (res.data._status !== "synced") {
      // Locally deleted, unsynced: scheduled for remote deletion.
      if (res.data._status === "deleted") {
        return {type: "skipped", data: res.data};
      } else if (deepEquals(cleanRecord(res.data), cleanRecord(change))) {
        // If records are identical, import anyway, so we bump the
        // local last_modified value from the server and set record
        // status to "synced".
        return await this.update(change, {synced: true}).then(res => {
          return {type: "updated", data: res.data};
        });
      } else {
        return {
          type: "conflicts",
          data: { type: "incoming", local: res.data, remote: change }
        };
      }
    } else if (change.deleted) {
      return await this.delete(change.id, {virtual: false}).then(res => {
        return {type: "deleted", data: res.data};
      });
    } else {
      return await this.update(change, {synced: true}).then(res => {
        return {type: "updated", data: res.data};
      });
    }
  }

  /**
   * Import changes into the local database.
   *
   * @param  {SyncResultObject} syncResultObject
   * @param  {Object} changeObject The change object.
   * @return {Promise}
   */
  async importChanges(syncResultObject, changeObject) {
    const imports = await Promise.all(changeObject.changes.map(change => {
      return this._importChange(change); // XXX direct method ref?
    }));
    for (let imported of imports) {
      syncResultObject.add(imported.type, imported.data);
    }
    syncResultObject.lastModified = changeObject.lastModified;
    // Don't persist lastModified value if conflicts occured
    if (syncResultObject.conflicts.length > 0)
      return syncResultObject;
    // No conflict occured, persist collection's lastModified value
    return await this.saveLastModified(syncResultObject.lastModified)
      .then(_ => syncResultObject);
  }

  /**
   * Store the lastModified value into collection's metadata store.
   *
   * @param  {Number}  lastModified
   * @param  {Object}  options
   * @return {Promise}
   */
  async saveLastModified(lastModified) {
    var value = parseInt(lastModified, 10);
    try {
      await this.open();
      return await new Promise((resolve, reject) => {
        const {transaction, store} = this.prepare("readwrite", "__meta__");
        const request = store.put({name: "lastModified", value: value});
        transaction.onerror = event => reject(event.target.error);
        transaction.oncomplete = event => {
          // update locally cached property
          this._lastModified = value;
          resolve(value);
        };
      });
    } catch(err) {
      this._handleError("saveLastModified")(err);
    }
  }

  /**
   * Retrieve saved collection's lastModified value.
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

  /**
   * Returns an object containing two lists:
   *
   * - `toDelete`: unsynced deleted records we can safely delete;
   * - `toSync`: local updates to send to the server.
   *
   * @return {Object}
   */
  gatherLocalChanges() {
    return this.list({}, {includeDeleted: true})
      .then(res => {
        return res.data.reduce((acc, record) => {
          if (record._status === "deleted" && !record.last_modified)
            acc.toDelete.push(record);
          else if (record._status !== "synced")
            acc.toSync.push(record);
          return acc;
        }, {toDelete: [], toSync: []});
      });
  }

  /**
   * Import remote changes to the local database. Will reject on encountered
   * conflicts.
   *
   * @param  {SyncResultObject} syncResultObject
   * @param  {Object}           options
   * @return {Promise}
   */
  pullChanges(syncResultObject, options={}) {
    options = Object.assign({lastModified: this.lastModified}, options);
    // First fetch remote changes from the server
    return this.api.fetchChangesSince(this.bucket, this.name, options)
      // Reflect these changes locally
      .then(changes => this.importChanges(syncResultObject, changes));
  }

  /**
   * Publish local changes to the remote server.
   *
   * @param  {SyncResultObject} syncResultObject
   * @param  {Object}           options
   * @return {Promise}
   */
  pushChanges(syncResultObject, options={}) {
    const safe = options.strategy === Collection.SERVER_WINS;
    options = Object.assign({safe}, options);

    // Fetch local changes
    return this.gatherLocalChanges()
      .then(({toDelete, toSync}) => {
        return Promise.all([
          // Delete never synced records marked for deletion
          Promise.all(toDelete.map(record => {
            return this.delete(record.id, {virtual: false});
          })),
          // Send batch update requests
          this.api.batch(this.bucket, this.name, toSync, options)
        ]);
      })
      // Update published local records
      .then(([deleted, synced]) => {
        return Promise.all(synced.published.map(record => {
          if (record.deleted) {
            // Remote deletion was successful, refect it locally
            return this.delete(record.id, {virtual: false}).then(res => {
              // Amend result data with the deleted attribute set
              return {data: {id: res.data.id, deleted: true}};
            });
          } else {
            // Remote update was successful, refect it locally
            return this.update(record, {synced: true});
          }
        })).then(published => {
          syncResultObject.add("published", published.map(res => res.data))
          return syncResultObject;
        });
      });
  }


  /**
   * Synchronize remote and local data. The promise will resolve with two lists:
   * - local imports
   * - remote exports
   * The promise will reject if conflicts have been encountered, with the same
   * result.
   *
   * Options:
   * - {Object} headers: HTTP headers to attach to outgoing requests.
   * - {Collection.strategy} strategy: The synchronization strategy:
   *   * `Collection.strategy.SERVER_WINS`:
   *     No remote data override will be performed by the server.
   *   * `Collection.strategy.CLIENT_WINS`:
   *     Conflicting server records will be overriden with local changes.
   *   * `Collection.strategy.MANUAL`:
   *     Conflicts will be reported in a dedicated array.
   *
   * @param  {Object} options Options.
   * @return {Promise}
   */
  sync(options={strategy: Collection.strategy.MANUAL, headers: {}}) {
    // TODO rename options.mode to options.strategy
    const result = new SyncResultObject();
    return this.getLastModified()
      .then(lastModified => this._lastModified = lastModified)
      .then(_ => this.pullChanges(result, options))
      .then(result => {
        if (!result.ok) {
          return result;
        } else {
          return this.pushChanges(result, options)
            .then(result => this.pullChanges(result, options));
        }
      });
  }
}
