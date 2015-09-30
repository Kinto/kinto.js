"use strict";

import { EventEmitter } from "events";
import deepEquals from "deep-eql";

import BaseAdapter from "./adapters/base";
import { reduceRecords, waterfall } from "./utils";
import { cleanRecord } from "./api";

import { v4 as uuid4 } from "uuid";
import { isUUID4 } from "./utils";

import IDB from "./adapters/IDB";

/**
 * Synchronization result object.
 */
export class SyncResultObject {
  /**
   * Object default values.
   * @type {Object}
   */
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
      resolved:     [],
    };
  }

  /**
   * Public constructor.
   */
  constructor() {
    /**
     * Current synchronization result status; becomes `false` when conflicts or
     * errors are registered.
     * @type {Boolean}
     */
    this.ok = true;
    Object.assign(this, SyncResultObject.defaults);
  }

  /**
   * Adds entries for a given result type.
   *
   * @param {String} type    The result type.
   * @param {Array}  entries The result entries.
   * @return {SyncResultObject}
   */
  add(type, entries) {
    if (!Array.isArray(this[type])) {
      return;
    }
    this[type] = this[type].concat(entries);
    this.ok = this.errors.length + this.conflicts.length === 0;
    return this;
  }

  /**
   * Reinitializes result entries for a given result type.
   *
   * @param  {String} type The result type.
   * @return {SyncResultObject}
   */
  reset(type) {
    this[type] = SyncResultObject.defaults[type];
    this.ok = this.errors.length + this.conflicts.length === 0;
    return this;
  }
}

function mark(status, record) {
  return Object.assign({}, record, {_status: status});
}

function markDeleted(record) {
  return mark("deleted", record);
}

function markSynced(record) {
  return mark("synced", record);
}

function createUUIDSchema() {
  return {
    generate() {
      return uuid4();
    },

    validate(id) {
      return isUUID4(id);
    }
  };
}

/**
 * Abstracts a collection of records stored in the local database, providing
 * CRUD operations and synchronization helpers.
 */
export default class Collection {
  /**
   * Constructor.
   *
   * Options:
   * - `{BaseAdapter} adapter` The DB adapter (default: `IDB`)
   * - `{String} dbPrefix`     The DB name prefix (default: `""`)
   *
   * @param  {String} bucket  The bucket identifier.
   * @param  {String} name    The collection name.
   * @param  {Api}    api     The Api instance.
   * @param  {Object} options The options object.
   */
  constructor(bucket, name, api, options={}) {
    this._bucket = bucket;
    this._name = name;
    this._lastModified = null;

    const DBAdapter = options.adapter || IDB;
    const dbPrefix = options.dbPrefix || "";
    const db = new DBAdapter(`${dbPrefix}${bucket}/${name}`);
    if (!(db instanceof BaseAdapter)) {
      throw new Error("Unsupported adapter.");
    }
    // public properties
    /**
     * The db adapter instance
     * @type {BaseAdapter}
     */
    this.db = db;
    /**
     * The Api instance.
     * @type {Api}
     */
    this.api = api;
    /**
     * The event emitter instance.
     * @type {EventEmitter}
     */
    this.events = options.events || new EventEmitter();
    /**
     * The IdSchema instance.
     * @type {Object}
     */
    this.idSchema = this._validateIdSchema(options.idSchema);
    /**
     * The list of remote transformers.
     * @type {Array}
     */
    this.remoteTransformers = this._validateRemoteTransformers(options.remoteTransformers);
  }

  /**
   * The collection name.
   * @type {String}
   */
  get name() {
    return this._name;
  }

  /**
   * The bucket name.
   * @type {String}
   */
  get bucket() {
    return this._bucket;
  }

  /**
   * The last modified timestamp.
   * @type {Number}
   */
  get lastModified() {
    return this._lastModified;
  }

  /**
   * Synchronization strategies. Available strategies are:
   *
   * - `MANUAL`: Conflicts will be reported in a dedicated array.
   * - `SERVER_WINS`: Conflicts are resolved using remote data.
   * - `CLIENT_WINS`: Conflicts are resolved using local data.
   *
   * @type {Object}
   */
  static get strategy() {
    return {
      CLIENT_WINS: "client_wins",
      SERVER_WINS: "server_wins",
      MANUAL:      "manual",
    };
  }

  /**
   * Validates an idSchema.
   *
   * @param  {Object|undefined} idSchema
   * @return {Object}
   */
  _validateIdSchema(idSchema) {
    if (typeof idSchema === "undefined") {
      return createUUIDSchema();
    }
    if (typeof idSchema !== "object") {
      throw new Error("idSchema must be an object.");
    } else if (typeof idSchema.generate !== "function") {
      throw new Error("idSchema must provide a generate function.");
    } else if (typeof idSchema.validate !== "function") {
      throw new Error("idSchema must provide a validate function.");
    }
    return idSchema;
  }

  /**
   * Validates a list of remote transformers.
   *
   * @param  {Array|undefined} remoteTransformers
   * @return {Array}
   */
  _validateRemoteTransformers(remoteTransformers) {
    if (typeof remoteTransformers === "undefined") {
      return [];
    }
    if (!Array.isArray(remoteTransformers)) {
      throw new Error("remoteTransformers should be an array.");
    }
    return remoteTransformers.map(transformer => {
      if (typeof transformer !== "object") {
        throw new Error("A transformer must be an object.");
      } else if (typeof transformer.encode !== "function") {
        throw new Error("A transformer must provide an encode function.");
      } else if (typeof transformer.decode !== "function") {
        throw new Error("A transformer must provide a decode function.");
      }
      return transformer;
    });
  }

  /**
   * Deletes every records in the current collection.
   *
   * @return {Promise}
   */
  clear() {
    return this.db.clear().then(() => {
      return {data: [], permissions: {}};
    });
  }

  /**
   * Encodes a record.
   *
   * @param  {String} type   Either "remote" or "local".
   * @param  {Object} record The record object to encode.
   * @return {Promise}
   */
  _encodeRecord(type, record) {
    if (!this[`${type}Transformers`].length) {
      return Promise.resolve(record);
    }
    return waterfall(this[`${type}Transformers`].map(transformer => {
      return record => transformer.encode(record);
    }), record);
  }

  /**
   * Decodes a record.
   *
   * @param  {String} type   Either "remote" or "local".
   * @param  {Object} record The record object to decode.
   * @return {Promise}
   */
  _decodeRecord(type, record) {
    if (!this[`${type}Transformers`].length) {
      return Promise.resolve(record);
    }
    return waterfall(this[`${type}Transformers`].reverse().map(transformer => {
      return record => transformer.decode(record);
    }), record);
  }

  /**
   * Adds a record to the local database.
   *
   * Note: If either the `useRecordId` or `synced` options are true, then the
   * record object must contain the id field to be validated. If none of these
   * options are true, an id is generated using the current IdSchema; in this
   * case, the record passed must not have an id.
   *
   * Options:
   * - {Boolean} synced       Sets record status to "synced" (default: false).
   * - {Boolean} useRecordId  Forces the id field from the record to be used,
   *                          instead of one that is generated automatically
   *                          (default: false).
   *
   * @param  {Object} record
   * @param  {Object} options
   * @return {Promise}
   */
  create(record, options={useRecordId: false, synced: false}) {
    const reject = msg => Promise.reject(new Error(msg));
    if (typeof(record) !== "object") {
      return reject("Record is not an object.");
    }
    if ((options.synced || options.useRecordId) && !record.id) {
      return reject(
        "Missing required Id; synced and useRecordId options require one");
    }
    if (!options.synced && !options.useRecordId && record.id) {
      return reject("Extraneous Id; can't create a record having one set.");
    }
    const newRecord = Object.assign({}, record, {
      id:      options.synced ||
                   options.useRecordId ? record.id :
                                     this.idSchema.generate(),
      _status: options.synced ? "synced" : "created"
    });
    if (!this.idSchema.validate(newRecord.id)) {
      return reject(`Invalid Id: ${newRecord.id}`);
    }
    return this.db.create(newRecord).then(record => {
      return {data: record, permissions: {}};
    });
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
  update(record, options={synced: false}) {
    if (typeof(record) !== "object") {
      return Promise.reject(new Error("Record is not an object."));
    }
    if (!record.id) {
      return Promise.reject(new Error("Cannot update a record missing id."));
    }
    if (!this.idSchema.validate(record.id)) {
      return Promise.reject(new Error(`Invalid Id: ${record.id}`));
    }
    return this.get(record.id).then(_ => {
      var newStatus = "updated";
      if (record._status === "deleted") {
        newStatus = "deleted";
      } else if (options.synced) {
        newStatus = "synced";
      }
      const updatedRecord = mark(newStatus, record);
      return this.db.update(updatedRecord).then(record => {
        return {data: record, permissions: {}};
      });
    });
  }

  /**
   * Retrieve a record by its id from the local database.
   *
   * @param  {String} id
   * @param  {Object} options
   * @return {Promise}
   */
  get(id, options={includeDeleted: false}) {
    if (!this.idSchema.validate(id)) {
      return Promise.reject(Error(`Invalid Id: ${id}`));
    }
    return this.db.get(id).then(record => {
      if (!record ||
         (!options.includeDeleted && record._status === "deleted")) {
        throw new Error(`Record with id=${id} not found.`);
      } else {
        return {data: record, permissions: {}};
      }
    });
  }

  /**
   * Deletes a record from the local database.
   *
   * Options:
   * - {Boolean} virtual: When set to `true`, doesn't actually delete the record,
   *   update its `_status` attribute to `deleted` instead.
   *
   * @param  {String} id       The record's Id.
   * @param  {Object} options  The options object.
   * @return {Promise}
   */
  delete(id, options={virtual: true}) {
    if (!this.idSchema.validate(id)) {
      return Promise.reject(new Error(`Invalid Id: ${id}`));
    }
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
          return this.update(markDeleted(res.data));
        }
      }
      return this.db.delete(id).then(id => {
        return {data: {id: id}, permissions: {}};
      });
    });
  }

  /**
   * Lists records from the local database.
   *
   * Params:
   * - {Object} filters The filters to apply (default: `{}`).
   * - {String} order   The order to apply   (default: `-last_modified`).
   *
   * Options:
   * - {Boolean} includeDeleted: Include virtually deleted records.
   *
   * @param  {Object} params  The filters and order to apply to the results.
   * @param  {Object} options The options object.
   * @return {Promise}
   */
  list(params={}, options={includeDeleted: false}) {
    params = Object.assign({order: "-last_modified", filters: {}}, params);
    return this.db.list().then(results => {
      var reduced = reduceRecords(params.filters, params.order, results);
      if (!options.includeDeleted) {
        reduced = reduced.filter(record => record._status !== "deleted");
      }
      return {data: reduced, permissions: {}};
    });
  }

  /**
   * Attempts to apply a remote change to its local matching record. Note that
   * at this point, remote record data are already decoded.
   *
   * @param  {Object} local  The local record object.
   * @param  {Object} remote The remote change object.
   * @return {Object}
   */
  _processChangeImport(batch, local, remote) {
    const identical = deepEquals(cleanRecord(local), cleanRecord(remote));
    if (local._status !== "synced") {
      // Locally deleted, unsynced: scheduled for remote deletion.
      if (local._status === "deleted") {
        return {type: "skipped", data: local};
      } else if (identical) {
        // If records are identical, import anyway, so we bump the
        // local last_modified value from the server and set record
        // status to "synced".
        return batch.update(markSynced(remote));
      } else {
        return {
          type: "conflicts",
          data: {type: "incoming", local: local, remote: remote}
        };
      }
    } else if (remote.deleted) {
      return batch.delete(remote.id);
    } else if (identical) {
      // if identical, simply exclude it from all lists
      return {type: "void", data: remote};
    } else {
      return batch.update(markSynced(remote));
    }
  }

  /**
   * Import a single change into the local database.
   *
   * @param  {Object} batch   The adapter's batch object.
   * @param  {Object} change  The change object.
   * @return {Promise}
   */
  _importChange(batch, change) {
    var _decodedChange, decodePromise;
    // If change is a deletion, skip decoding
    if (change.deleted) {
      decodePromise = Promise.resolve(change);
    } else {
      decodePromise = this._decodeRecord("remote", change);
    }
    return decodePromise
      .then(change => {
        _decodedChange = change;
        // Check for an already existing local version
        return batch.get(_decodedChange.id);
      })
      .then(local => {
        if (local) {
          // Local version found; process updating.
          return this._processChangeImport(batch, local, _decodedChange);
        } else if (_decodedChange.deleted) {
          // Remotely deleted, missing locally; skipping.
          return {type: "skipped", data: _decodedChange};
        } else {
          // Missing locally, remotely created; importing locally.
          return batch.create(markSynced(_decodedChange));
        }
      });
  }

  /**
   * Import changes into the local database.
   *
   * @param  {SyncResultObject} syncResultObject The sync result object.
   * @param  {Object}           changeObject     The change object.
   * @return {Promise}
   */
  importChanges(syncResultObject, changeObject) {
    const conflicts = [], skipped = [];
    // Ensure all imports are done within a single transaction
    const batchResult = this.db.batch(batch => {
      return Promise.all(changeObject.changes.map(change => {
        return this._importChange(batch, change).then(importResult => {
          if (importResult.type === "conflicts") {
            conflicts.push(importResult.data);
          } else if (importResult.type === "skipped") {
            skipped.push(importResult.data);
          }
          return importResult;
        });
      }));
    });
    return batchResult
      .then(({operations, errors}) => {
        syncResultObject.add("skipped", skipped);
        syncResultObject.add("conflicts", conflicts);
        syncResultObject.add("errors", errors);
        operations.forEach(operation => {
          if (operation.type !== "void") {
            // operations can only be create(d), update(d), delete(d)
            syncResultObject.add(`${operation.type}d`, operation.data);
          }
        });
        return syncResultObject;
      })
      .then(syncResultObject => {
        syncResultObject.lastModified = changeObject.lastModified;
        // Don't persist lastModified value if any conflict or error occured
        if (!syncResultObject.ok) {
          return syncResultObject;
        }
        // No conflict occured, persist collection's lastModified value
        return this.db.saveLastModified(syncResultObject.lastModified)
          .then(lastModified => {
            this._lastModified = lastModified;
            return syncResultObject;
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
    var _toDelete;
    return this.list({}, {includeDeleted: true})
      .then(res => {
        return res.data.reduce((acc, record) => {
          if (record._status === "deleted" && !record.last_modified) {
            acc.toDelete.push(record);
          } else if (record._status !== "synced") {
            acc.toSync.push(record);
          }
          return acc;
          // rename toSync to toPush or toPublish
        }, {toDelete: [], toSync: []});
      })
      .then(({toDelete, toSync}) => {
        _toDelete = toDelete;
        return Promise.all(toSync.map(this._encodeRecord.bind(this, "remote")));
      })
      .then(toSync => ({toDelete: _toDelete, toSync}));
  }

  /**
   * Fetch remote changes, import them to the local database, and handle
   * conflicts according to `options.strategy`.
   *
   * Options:
   * - {String} strategy: The selected sync strategy.
   *
   * @param  {SyncResultObject} syncResultObject
   * @param  {Object}           options
   * @return {Promise}
   */
  pullChanges(syncResultObject, options={}) {
    if (!syncResultObject.ok) {
      return Promise.resolve(syncResultObject);
    }
    options = Object.assign({
      strategy: Collection.strategy.MANUAL,
      lastModified: this.lastModified,
      headers: {},
    }, options);
    // First fetch remote changes from the server
    return this.api.fetchChangesSince(this.bucket, this.name, {
      lastModified: options.lastModified,
      headers: options.headers
    })
      // Reflect these changes locally
      .then(changes => this.importChanges(syncResultObject, changes))
      // Handle conflicts, if any
      .then(result => this._handleConflicts(result, options.strategy));
  }

  /**
   * Publish local changes to the remote server.
   *
   * @param  {SyncResultObject} syncResultObject
   * @param  {Object}           options
   * @return {Promise}
   */
  pushChanges(syncResultObject, options={}) {
    if (!syncResultObject.ok) {
      return Promise.resolve(syncResultObject);
    }
    const safe = options.strategy === Collection.SERVER_WINS;
    options = Object.assign({safe}, options);

    // Fetch local changes
    return this.gatherLocalChanges()
      .then(localChanges => {
        // Delete never synced records marked for deletion
        return this.db.batch(batch => {
          for (let record of localChanges.toDelete) {
            batch.delete(record.id);
          }
        }).then(_ => {
          // Send batch update requests
          return this.api.batch(this.bucket, this.name, localChanges.toSync, options);
        });
      })
      // Prepare result object and decode published records
      .then(synced => {
        // Merge outgoing errors into sync result object
        syncResultObject.add("errors", synced.errors);
        // Merge outgoing conflicts into sync result object
        syncResultObject.add("conflicts", synced.conflicts);
        // Decode published records
        return Promise.all(synced.published.map(record => {
          return record.deleted ? record : this._decodeRecord("remote", record);
        }));
      })
      // Batch perform required local updates
      .then(published => {
        return this.db.batch(batch => {
          for (let record of published) {
            if (record.deleted) {
              // Remote deletion to reflect locally
              batch.delete(record.id);
            } else {
              // Remote creation/update, reflect it locally
              batch.update(markSynced(record));
            }
          }
        });
      })
      .then(({operations, errors}) => {
        return syncResultObject
          .add("errors", errors)
          .add("published", operations.map(operation => {
            if (operation.type === "delete") {
              // Expose published deletion in a more meaningful fashion
              return {deleted: true, id: operation.data};
            }
            return operation.data;
          }));
      })
      // Handle conflicts, if any
      .then(result => this._handleConflicts(result, options.strategy))
      .then(result => {
        const resolvedUnsynced = result.resolved
          .filter(record => record._status !== "synced");
        // No resolved conflict to reflect anywhere
        if (resolvedUnsynced.length === 0 || options.resolved) {
          return result;
        } else if (options.strategy === Collection.strategy.CLIENT_WINS && !options.resolved) {
          // We need to push local versions of the records to the server
          return this.pushChanges(result, Object.assign({}, options, {resolved: true}));
        } else if (options.strategy === Collection.strategy.SERVER_WINS) {
          // If records have been automatically resolved according to strategy and
          // are in non-synced status, mark them as synced.
          // XXX: Ensure all updates are done within a single transaction
          return Promise.all(resolvedUnsynced.map(record => {
            return this.update(record, {synced: true});
          })).then(_ => result);
        }
      });
  }

  /**
   * Resolves a conflict, updating local record according to proposed
   * resolution — keeping remote record `last_modified` value as a reference for
   * further batch sending.
   *
   * @param  {Object} conflict   The conflict object.
   * @param  {Object} resolution The proposed record.
   * @return {Promise}
   */
  resolve(conflict, resolution) {
    return this.update(Object.assign({}, resolution, {
      // Ensure local record has the latest authoritative timestamp
      last_modified: conflict.remote.last_modified
    }));
  }

  /**
   * Handles synchronization conflicts according to specified strategy.
   *
   * @param  {SyncResultObject} result    The sync result object.
   * @param  {String}           strategy  The sync strategy.
   * @return {Promise}
   */
  _handleConflicts(result, strategy=Collection.strategy.MANUAL) {
    if (strategy === Collection.strategy.MANUAL || result.conflicts.length === 0) {
      return Promise.resolve(result);
    }
    // XXX: Ensure all updates are done within a single transaction
    return Promise.all(result.conflicts.map(conflict => {
      const resolution = strategy === Collection.strategy.CLIENT_WINS ?
                         conflict.local : conflict.remote;
      return this.resolve(conflict, resolution);
    })).then(imports => {
      return result
        .reset("conflicts")
        .add("resolved", imports.map(res => res.data));
    });
  }

  /**
   * Synchronize remote and local data. The promise will resolve with a
   * SyncResultObject, though will reject:
   *
   * - if conflicts have been encountered, with the same result;
   * - if the server is currently backed off.
   *
   * Options:
   * - {Object} headers: HTTP headers to attach to outgoing requests.
   * - {Collection.strategy} strategy: See `Collection.strategy`.
   * - {Boolean} ignoreBackoff: Force synchronization even if server is currently
   *   backed off.
   *
   * @param  {Object} options Options.
   * @return {Promise}
   */
  sync(options={strategy: Collection.strategy.MANUAL, headers: {}, ignoreBackoff: false}) {
    if (!options.ignoreBackoff && this.api.backoff > 0) {
      const seconds = Math.ceil(this.api.backoff / 1000);
      return Promise.reject(
        new Error(`Server is backed off; retry in ${seconds}s or use the ignoreBackoff option.`));
    }
    const result = new SyncResultObject();
    return this.db.getLastModified()
      .then(lastModified => this._lastModified = lastModified)
      .then(_ => this.pullChanges(result, options))
      .then(result => this.pushChanges(result, options))
      .then(result => {
        // Avoid performing a last pull if nothing has been published.
        if (result.published.length === 0) {
          return result;
        }
        return this.pullChanges(result, options);
      });
  }
}
