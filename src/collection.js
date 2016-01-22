"use strict";

import BaseAdapter from "./adapters/base";
import { reduceRecords, waterfall } from "./utils";
import { cleanRecord } from "./api";

import { v4 as uuid4 } from "uuid";
import { deepEquals, isUUID, pFinally } from "./utils";

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

function createUUIDSchema() {
  return {
    generate() {
      return uuid4();
    },

    validate(id) {
      return isUUID(id);
    }
  };
}


function importChange(transaction, remote) {
  const local = transaction.get(remote.id);
  if (!local) {
    // Not found locally but remote change is marked as deleted; skip to
    // avoid recreation.
    if (remote.deleted) {
      return {type: "skipped", data: remote};
    }
    const synced = Object.assign({}, remote, {_status: "synced"});
    transaction.create(synced);
    return {type: "created", data: synced};
  }
  const identical = deepEquals(cleanRecord(local), cleanRecord(remote));
  if (local._status !== "synced") {
    // Locally deleted, unsynced: scheduled for remote deletion.
    if (local._status === "deleted") {
      return {type: "skipped", data: local};
    }
    if (identical) {
      // If records are identical, import anyway, so we bump the
      // local last_modified value from the server and set record
      // status to "synced".
      const synced = Object.assign({}, remote, {_status: "synced"});
      transaction.update(synced);
      return {type: "updated", data: synced};
    }
    return {
      type: "conflicts",
      data: {type: "incoming", local: local, remote: remote}
    };
  }
  if (remote.deleted) {
    transaction.delete(remote.id);
    return {type: "deleted", data: {id: local.id}};
  }
  const synced = Object.assign({}, remote, {_status: "synced"});
  transaction.update(synced);
  // if identical, simply exclude it from all lists
  const type = identical ? "void" : "updated";
  return {type, data: synced};
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

    const DBAdapter = options.adapter;
    if (!DBAdapter) {
      throw new Error("No adapter provided");
    }
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
    this.events = options.events;
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
   * Deletes every records in the current collection and marks the collection as
   * never synced.
   *
   * @return {Promise}
   */
  clear() {
    return this.db.clear()
      .then(_ => this.db.saveLastModified(null))
      .then(_ => ({data: [], permissions: {}}));
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
   * - {Boolean} synced       Sets record status to "synced" (default: `false`).
   * - {Boolean} useRecordId  Forces the `id` field from the record to be used,
   *                          instead of one that is generated automatically
   *                          (default: `false`).
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
      let newStatus = "updated";
      if (record._status === "deleted") {
        newStatus = "deleted";
      } else if (options.synced) {
        newStatus = "synced";
      }
      const updatedRecord = Object.assign({}, record, {_status: newStatus});
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
   *   update its `_status` attribute to `deleted` instead (default: true)
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
    return this.get(id, {includeDeleted: true})
      .then(res => {
        const existing = res.data;
        return this.db.execute((transaction) => {
          // Virtual updates status.
          if (options.virtual) {
            const deleted = Object.assign({}, existing, {
              _status: "deleted"
            });
            transaction.update(deleted);
          } else {
            // Delete for real.
            transaction.delete(id);
          }
        });
      })
      .then(_ => ({data: {id: id}, permissions: {}}));
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
      let reduced = reduceRecords(params.filters, params.order, results);
      if (!options.includeDeleted) {
        reduced = reduced.filter(record => record._status !== "deleted");
      }
      return {data: reduced, permissions: {}};
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
    return Promise.all(changeObject.changes.map(change => {
      if (change.deleted) {
        return Promise.resolve(change);
      }
      return this._decodeRecord("remote", change);
    }))
      .then(decodedChanges => {
        const changeIds = decodedChanges.map(change => change.id);
        return this.list({}, {includeDeleted: true})
          .then(res => {
            const existingRecords = res.data.filter(record => {
              return changeIds.indexOf(record.id) !== -1;
            });
            return {decodedChanges, existingRecords};
          });
      })
      .then(({decodedChanges, existingRecords}) => {
        return this.db.execute(transaction => {
          return decodedChanges.map(remote => {
            // Store remote change into local database.
            return importChange(transaction, remote);
          });
        }, {preload: existingRecords});
      })
      .catch(err => {
        // XXX todo
        err.type = "incoming";
        // XXX one error of the whole transaction instead of one per atomic op
        return [{type: "errors", data: err}];
      })
      .then(imports => {
        for (const imported of imports) {
          if (imported.type !== "void") {
            syncResultObject.add(imported.type, imported.data);
          }
        }
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
   * Resets the local records as if they were never synced; existing records are
   * marked as newly created, deleted records are dropped.
   *
   * A next call to {@link Collection.sync} will thus republish the whole content of the
   * local collection to the server.
   *
   * @return {Promise} Resolves with the number of processed records.
   */
  resetSyncStatus() {
    let _count;
    return this.list({}, {includeDeleted: true})
      .then(result => {
        return this.db.execute(transaction => {
          _count = result.data.length;
          result.data.forEach(r => {
            // Garbage collect deleted records.
            if (r._status === "deleted") {
              transaction.delete(r.id);
            } else {
              // Records that were synced become «created».
              transaction.update(Object.assign({}, r, {
                last_modified: undefined,
                _status: "created"
              }));
            }
          });
        });
      })
      .then(() => this.db.saveLastModified(null))
      .then(() => _count);
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
    let _toDelete;
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
   * conflicts according to `options.strategy`. Then, updates the passed
   * {@link SyncResultObject} with import results.
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
   * Publish local changes to the remote server and updates the passed
   * {@link SyncResultObject} with publication results.
   *
   * @param  {SyncResultObject} syncResultObject The sync result object.
   * @param  {Object}           options          The options object.
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
      .then(({toDelete, toSync}) => {
        return Promise.all([
          // Delete never synced records marked for deletion
          this.db.execute((transaction) => {
            toDelete.forEach(record => {
              transaction.delete(record.id);
            });
          }),
          // Send batch update requests
          this.api.batch(this.bucket, this.name, toSync, options)
        ]);
      })
      // Update published local records
      .then(([deleted, synced]) => {
        const {errors, conflicts, published, skipped} = synced;
        // Merge outgoing errors into sync result object
        syncResultObject.add("errors", errors.map(error => {
          error.type = "outgoing";
          return error;
        }));
        // Merge outgoing conflicts into sync result object
        syncResultObject.add("conflicts", conflicts);
        // Reflect publication results locally
        const missingRemotely = skipped.map(r => Object.assign({}, r, {deleted: true}));
        const toApplyLocally = published.concat(missingRemotely);
        // Deleted records are distributed accross local and missing records
        const toDeleteLocally = toApplyLocally.filter((r) => r.deleted);
        const toUpdateLocally = toApplyLocally.filter((r) => !r.deleted);
        // First, apply the decode transformers, if any
        return Promise.all(toUpdateLocally.map(record => {
          return this._decodeRecord("remote", record);
        }))
          // Process everything within a single transaction
          .then((results) => {
            return this.db.execute((transaction) => {
              const updated = results.map((r) => {
                const synced = Object.assign({}, r, {_status: "synced"});
                transaction.update(synced);
                return {data: synced};
              });
              const deleted = toDeleteLocally.map((r) => {
                transaction.delete(r.id);
                // Amend result data with the deleted attribute set
                return {data: {id: r.id, deleted: true}};
              });
              return updated.concat(deleted);
            });
          })
          .then((published) => {
            syncResultObject.add("published", published.map(res => res.data));
            return syncResultObject;
          });
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
          return this.db.execute((transaction) => {
            resolvedUnsynced.forEach((record) => {
              transaction.update(Object.assign({}, record, {_status: "synced"}));
            });
            return result;
          });
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
   * @param  {String}           strategy  The {@link Collection.strategy}.
   * @return {Promise}
   */
  _handleConflicts(result, strategy=Collection.strategy.MANUAL) {
    if (strategy === Collection.strategy.MANUAL || result.conflicts.length === 0) {
      return Promise.resolve(result);
    }
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
   * {@link SyncResultObject}, though will reject:
   *
   * - if the server is currently backed off;
   * - if the server has been detected flushed.
   *
   * Options:
   * - {Object} headers: HTTP headers to attach to outgoing requests.
   * - {Collection.strategy} strategy: See {@link Collection.strategy}.
   * - {Boolean} ignoreBackoff: Force synchronization even if server is currently
   *   backed off.
   * - {String} remote The remote Kinto server endpoint to use (default: null).
   *
   * @param  {Object} options Options.
   * @return {Promise}
   * @throws {Error} If an invalid remote option is passed.
   */
  sync(options={
    strategy: Collection.strategy.MANUAL,
    headers: {},
    ignoreBackoff: false,
    remote: null,
  }) {
    const previousRemote = this.api.remote;
    if (options.remote) {
      // Note: setting the remote ensures it's valid, throws when invalid.
      this.api.remote = options.remote;
    }
    if (!options.ignoreBackoff && this.api.backoff > 0) {
      const seconds = Math.ceil(this.api.backoff / 1000);
      return Promise.reject(
        new Error(`Server is backed off; retry in ${seconds}s or use the ignoreBackoff option.`));
    }
    const result = new SyncResultObject();
    const syncPromise = this.db.getLastModified()
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
    // Ensure API default remote is reverted if a custom one's been used
    return pFinally(syncPromise, () => this.api.remote = previousRemote);
  }

  /**
   * Load a list of records already synced with the remote server.
   *
   * The local records which are unsynced or whose timestamp is either missing
   * or superior to those being loaded will be ignored.
   *
   * @param  {Array} records The previously exported list of records to load.
   * @return {Promise} with the effectively imported records.
   */
  loadDump(records) {
    const reject = msg => Promise.reject(new Error(msg));
    if (!Array.isArray(records)) {
      return reject("Records is not an array.");
    }

    for(const record of records) {
      if (!record.id || !this.idSchema.validate(record.id)) {
        return reject("Record has invalid ID: " + JSON.stringify(record));
      }

      if (!record.last_modified) {
        return reject("Record has no last_modified value: " + JSON.stringify(record));
      }
    }

    // Fetch all existing records from local database,
    // and skip those who are newer or not marked as synced.
    return this.list({}, {includeDeleted: true})
      .then(res => {
        return res.data.reduce((acc, record) => {
          acc[record.id] = record;
          return acc;
        }, {});
      })
    .then(existingById => {
      return records.filter(record => {
        const localRecord = existingById[record.id];
        const shouldKeep = (
          // No local record with this id.
          localRecord === undefined ||
          // Or local record is synced
          localRecord._status === "synced" &&
          // And was synced from server
          localRecord.last_modified !== undefined &&
          // And is older than imported one.
          record.last_modified > localRecord.last_modified
        );
        return shouldKeep;
      });
    })
    .then(newRecords => {
      return newRecords.map(record => {
        return Object.assign({}, record, {
          _status: "synced"
        });
      });
    })
    .then(newRecords => this.db.loadDump(newRecords));
  }
}
