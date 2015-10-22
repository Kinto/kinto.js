"use strict";

import BaseAdapter from "./adapters/base";
import { reduceRecords, waterfall } from "./utils";
import { cleanRecord } from "./api";

import { v4 as uuid4 } from "uuid";
import { deepEquals, isUUID4 } from "./utils";

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
   * Deletes every records in the current collection.
   *
   * XXX: refs #114, collection metas should be cleared.
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
      var newStatus = "updated";
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
          return this.update(Object.assign({}, res.data, {
            _status: "deleted"
          }));
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
   * @return {Promise}
   */
  _processChangeImport(local, remote) {
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
        return this.update(remote, {synced: true}).then(res => {
          return {type: "updated", data: res.data};
        });
      }
      return {
        type: "conflicts",
        data: {type: "incoming", local: local, remote: remote}
      };
    }
    if (remote.deleted) {
      return this.delete(remote.id, {virtual: false}).then(res => {
        return {type: "deleted", data: res.data};
      });
    }
    return this.update(remote, {synced: true}).then(updated => {
      // if identical, simply exclude it from all lists
      const type = identical ? "void" : "updated";
      return {type, data: updated.data};
    });
  }

  /**
   * Import a single change into the local database.
   *
   * @param  {Object} change
   * @return {Promise}
   */
  _importChange(change) {
    var _decodedChange, decodePromise;
    // if change is a deletion, skip decoding
    if (change.deleted) {
      decodePromise = Promise.resolve(change);
    } else {
      decodePromise = this._decodeRecord("remote", change);
    }
    return decodePromise
      .then(change => {
        _decodedChange = change;
        return this.get(_decodedChange.id, {includeDeleted: true});
      })
      // Matching local record found
      .then(res => this._processChangeImport(res.data, _decodedChange))
      .catch(err => {
        if (!(/not found/i).test(err.message)) {
          err.type = "incoming";
          return {type: "errors", data: err};
        }
        // Not found locally but remote change is marked as deleted; skip to
        // avoid recreation.
        if (_decodedChange.deleted) {
          return {type: "skipped", data: _decodedChange};
        }
        return this.create(_decodedChange, {synced: true})
          // If everything went fine, expose created record data
          .then(res => ({type: "created", data: res.data}))
          // Expose individual creation errors
          .catch(err => ({type: "errors", data: err}));
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
      return this._importChange(change);
    }))
      .then(imports => {
        for (let imported of imports) {
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
    var _count;
    return this.list({}, {includeDeleted: true})
      .then(res => {
        return Promise.all(res.data.map(r => {
          // Garbage collect deleted records.
          if (r._status === "deleted") {
            return this.db.delete(r.id);
          }
          // Records that were synced become «created».
          return this.db.update(Object.assign({}, r, {
            last_modified: undefined,
            _status: "created"
          }));
        }));
      })
      .then(res => {
        _count = res.length;
        return this.db.saveLastModified(null);
      })
      .then(_ => _count);
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
          Promise.all(toDelete.map(record => {
            return this.delete(record.id, {virtual: false});
          })),
          // Send batch update requests
          this.api.batch(this.bucket, this.name, toSync, options)
        ]);
      })
      // Update published local records
      .then(([deleted, synced]) => {
        // Merge outgoing errors into sync result object
        syncResultObject.add("errors", synced.errors.map(error => {
          error.type = "outgoing";
          return error;
        }));
        // Merge outgoing conflicts into sync result object
        syncResultObject.add("conflicts", synced.conflicts);
        // Process local updates following published changes
        return Promise.all(synced.published.map(record => {
          if (record.deleted) {
            // Remote deletion was successful, refect it locally
            return this.delete(record.id, {virtual: false}).then(res => {
              // Amend result data with the deleted attribute set
              return {data: {id: res.data.id, deleted: true}};
            });
          } else {
            // Remote create/update was successful, reflect it locally
            return this._decodeRecord("remote", record)
              .then(record => this.update(record, {synced: true}));
          }
        })).then(published => {
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
