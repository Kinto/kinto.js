"use strict";

import BaseAdapter from "./base.js";
import { filterObject, omitKeys, sortObjects, arrayEqual } from "../utils";

const INDEXED_FIELDS = ["id", "_status", "last_modified"];

/**
 * Small helper that wraps the opening of an IndexedDB into a Promise.
 *
 * @param dbname          {String}   The database name.
 * @param version         {Integer}  Schema version
 * @param onupgradeneeded {Function} The callback to execute if schema is
 *                                   missing or different.
 * @return {Promise<IDBDatabase>}
 */
export async function open(dbname, { version, onupgradeneeded }) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbname, version);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      db.onerror = event => reject(event.target.error);
      return onupgradeneeded(event);
    };
    request.onerror = event => {
      reject(event.target.error);
    };
    request.onsuccess = event => {
      const db = event.target.result;
      resolve(db);
    };
  });
}

/**
 * Helper to run the specified callback in a single transaction on the
 * specified store.
 * The helper focuses on transaction wrapping into a promise.
 *
 * @param db           {IDBDatabase} The database instance.
 * @param name         {String}      The store name.
 * @param callback     {Function}    The piece of code to execute in the transaction.
 * @param options      {Object}      Options.
 * @param options.mode {String}      Transaction mode (default: read).
 * @return {Promise} any value returned by the callback.
 */
export async function execute(db, name, callback, options = {}) {
  const { mode } = options;
  return new Promise((resolve, reject) => {
    // On Safari, calling IDBDatabase.transaction with mode == undefined raises
    // a TypeError.
    const transaction = mode
      ? db.transaction([name], mode)
      : db.transaction([name]);
    const store = transaction.objectStore(name);

    // Let the callback abort this transaction.
    const abort = e => {
      transaction.abort();
      reject(e);
    };
    // Execute the specified callback **synchronously**.
    let result;
    try {
      result = callback(store, abort);
    } catch (e) {
      abort(e);
    }
    transaction.onerror = event => reject(event.target.error);
    transaction.oncomplete = event => resolve(result);
  });
}

/**
 * Helper to wrap the deletion of an IndexedDB database into a promise.
 *
 * @param dbName {String} the database to delete
 * @return {Promise}
 */
async function deleteDatabase(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = event => resolve(event.target);
    request.onerror = event => reject(event.target.error);
  });
}

/**
 * IDB cursor handlers.
 * @type {Object}
 */
const cursorHandlers = {
  all(filters, done) {
    const results = [];
    return event => {
      const cursor = event.target.result;
      if (cursor) {
        const { value } = cursor;
        if (filterObject(filters, value)) {
          results.push(value);
        }
        cursor.continue();
      } else {
        done(results);
      }
    };
  },

  in(values, filters, done) {
    const results = [];
    return function(event) {
      const cursor = event.target.result;
      if (!cursor) {
        done(results);
        return;
      }
      const { key, value } = cursor;
      // `key` can be an array of two values (see `keyPath` in indices definitions).
      let i = 0;
      // `values` can be an array of arrays if we filter using an index whose key path
      // is an array (eg. `cursorHandlers.in([["bid/cid", 42], ["bid/cid", 43]], ...)`)
      while (key > values[i]) {
        // The cursor has passed beyond this key. Check next.
        ++i;
        if (i === values.length) {
          done(results); // There is no next. Stop searching.
          return;
        }
      }
      const isEqual = Array.isArray(key)
        ? arrayEqual(key, values[i])
        : key === values[i];
      if (isEqual) {
        if (filterObject(filters, value)) {
          results.push(value);
        }
        cursor.continue();
      } else {
        cursor.continue(values[i]);
      }
    };
  },
};

/**
 * Creates an IDB request and attach it the appropriate cursor event handler to
 * perform a list query.
 *
 * Multiple matching values are handled by passing an array.
 *
 * @param  {String}           cid        The collection id (ie. `{bid}/{cid}`)
 * @param  {IDBStore}         store      The IDB store.
 * @param  {Object}           filters    Filter the records by field.
 * @param  {Function}         done       The operation completion handler.
 * @return {IDBRequest}
 */
function createListRequest(cid, store, filters, done) {
  // Introspect filters and check if they leverage an indexed field.
  const indexField = Object.keys(filters).find(field => {
    return INDEXED_FIELDS.includes(field);
  });

  if (!indexField) {
    // Get all records for this collection (ie. cid)
    const request = store.index("cid").openCursor(IDBKeyRange.only(cid));
    request.onsuccess = cursorHandlers.all(filters, done);
    return request;
  }

  // If `indexField` was used already, don't filter again.
  const remainingFilters = omitKeys(filters, indexField);

  // value specified in the filter (eg. `filters: { _status: ["created", "updated"] }`)
  const value = filters[indexField];

  // WHERE IN equivalent clause
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return done([]);
    }
    const values = value.map(i => [cid, i]).sort();
    const range = IDBKeyRange.bound(values[0], values[values.length - 1]);
    const request = store.index(indexField).openCursor(range);
    request.onsuccess = cursorHandlers.in(values, remainingFilters, done);
    return request;
  }

  // WHERE field = value clause
  const request = store
    .index(indexField)
    .openCursor(IDBKeyRange.only([cid, value]));
  request.onsuccess = cursorHandlers.all(remainingFilters, done);
  return request;
}

/**
 * IndexedDB adapter.
 *
 * This adapter doesn't support any options.
 */
export default class IDB extends BaseAdapter {
  /**
   * Constructor.
   *
   * @param  {String} cid  The key base for this collection (eg. `bid/cid`)
   * @param  {Object} options
   * @param  {String} options.dbName         The IndexedDB name (default: `"KintoDB"`)
   * @param  {String} options.migrateOldData Whether old database data should be migrated (default: `false`)
   */
  constructor(cid, options = {}) {
    super();

    this.cid = cid;
    this.dbName = options.dbName || "KintoDB";

    this._options = options;
    this._db = null;
  }

  _handleError(method, err) {
    const error = new Error(method + "() " + err.message);
    error.stack = err.stack;
    throw error;
  }

  /**
   * Ensures a connection to the IndexedDB database has been opened.
   *
   * @override
   * @return {Promise}
   */
  async open() {
    if (this._db) {
      return this;
    }

    // In previous versions, we used to have a database with name `${bid}/${cid}`.
    // Check if it exists, and migrate data once new schema is in place.
    // Note: the built-in migrations from IndexedDB can only be used if the
    // database name does not change.
    const dataToMigrate = this._options.migrateOldData
      ? await migrationRequired(this.cid)
      : null;

    this._db = await open(this.dbName, {
      version: 1,
      onupgradeneeded: event => {
        const db = event.target.result;
        // Records store
        const recordsStore = db.createObjectStore("records", {
          keyPath: ["_cid", "id"],
        });
        // An index to obtain all the records in a collection.
        recordsStore.createIndex("cid", "_cid");
        // Here we create indices for every known field in records by collection.
        // Record id (generated by IdSchema, UUID by default)
        recordsStore.createIndex("id", ["_cid", "id"]);
        // Local record status ("synced", "created", "updated", "deleted")
        recordsStore.createIndex("_status", ["_cid", "_status"]);
        // Last modified field
        recordsStore.createIndex("last_modified", ["_cid", "last_modified"]);
        // Timestamps store
        db.createObjectStore("timestamps", {
          keyPath: "cid",
        });
      },
    });

    if (dataToMigrate) {
      const { records, timestamp } = dataToMigrate;
      await this.loadDump(records);
      await this.saveLastModified(timestamp);
      console.log(`${this.cid}: data was migrated successfully.`);
      // Delete the old database.
      await deleteDatabase(this.cid);
      console.warn(`${this.cid}: old database was deleted.`);
    }

    return this;
  }

  /**
   * Closes current connection to the database.
   *
   * @override
   * @return {Promise}
   */
  close() {
    if (this._db) {
      this._db.close(); // indexedDB.close is synchronous
      this._db = null;
    }
    return Promise.resolve();
  }

  /**
   * Returns a transaction and an object store for a store name.
   *
   * To determine if a transaction has completed successfully, we should rather
   * listen to the transaction’s complete event rather than the IDBObjectStore
   * request’s success event, because the transaction may still fail after the
   * success event fires.
   *
   * @param  {String}      name  Store name
   * @param  {Function}    callback to execute
   * @param  {Object}      options Options
   * @param  {String}      options.mode  Transaction mode ("readwrite" or undefined)
   * @return {Object}
   */
  async prepare(name, callback, options) {
    await this.open();
    await execute(this._db, name, callback, options);
  }

  /**
   * Deletes every records in the current collection.
   *
   * @override
   * @return {Promise}
   */
  async clear() {
    try {
      await this.prepare(
        "records",
        store => {
          const range = IDBKeyRange.only(this.cid);
          const request = store.index("cid").openKeyCursor(range);
          request.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
              store.delete(cursor.primaryKey);
              cursor.continue();
            }
          };
          return request;
        },
        { mode: "readwrite" }
      );
    } catch (e) {
      this._handleError("clear", e);
    }
  }

  /**
   * Executes the set of synchronous CRUD operations described in the provided
   * callback within an IndexedDB transaction, for current db store.
   *
   * The callback will be provided an object exposing the following synchronous
   * CRUD operation methods: get, create, update, delete.
   *
   * Important note: because limitations in IndexedDB implementations, no
   * asynchronous code should be performed within the provided callback; the
   * promise will therefore be rejected if the callback returns a Promise.
   *
   * Options:
   * - {Array} preload: The list of record IDs to fetch and make available to
   *   the transaction object get() method (default: [])
   *
   * @example
   * const db = new IDB("example");
   * const result = await db.execute(transaction => {
   *   transaction.create({id: 1, title: "foo"});
   *   transaction.update({id: 2, title: "bar"});
   *   transaction.delete(3);
   *   return "foo";
   * });
   *
   * @override
   * @param  {Function} callback The operation description callback.
   * @param  {Object}   options  The options object.
   * @return {Promise}
   */
  async execute(callback, options = { preload: [] }) {
    // Transactions in IndexedDB are autocommited when a callback does not
    // perform any additional operation.
    // The way Promises are implemented in Firefox (see https://bugzilla.mozilla.org/show_bug.cgi?id=1193394)
    // prevents using within an opened transaction.
    // To avoid managing asynchronocity in the specified `callback`, we preload
    // a list of record in order to execute the `callback` synchronously.
    // See also:
    // - http://stackoverflow.com/a/28388805/330911
    // - http://stackoverflow.com/a/10405196
    // - https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/
    let result;
    await this.prepare(
      "records",
      (store, abort) => {
        const runCallback = (preloaded = []) => {
          // Expose a consistent API for every adapter instead of raw store methods.
          const proxy = transactionProxy(this, store, preloaded);
          // The callback is executed synchronously within the same transaction.
          try {
            const returned = callback(proxy);
            if (returned instanceof Promise) {
              // XXX: investigate how to provide documentation details in error.
              throw new Error(
                "execute() callback should not return a Promise."
              );
            }
            // Bring to scope that will be returned (once promise awaited).
            result = returned;
          } catch (e) {
            // The callback has thrown an error explicitly. Abort transaction cleanly.
            abort(e);
          }
        };

        // No option to preload records, go straight to `callback`.
        if (!options.preload.length) {
          return runCallback();
        }

        // Preload specified records using a list request.
        const filters = { id: options.preload };
        createListRequest(this.cid, store, filters, records => {
          // Store obtained records by id.
          const preloaded = records.reduce((acc, record) => {
            acc[record.id] = omitKeys(record, ["_cid"]);
            return acc;
          }, {});
          runCallback(preloaded);
        });
      },
      { mode: "readwrite" }
    );
    return result;
  }

  /**
   * Retrieve a record by its primary key from the IndexedDB database.
   *
   * @override
   * @param  {String} id The record id.
   * @return {Promise}
   */
  async get(id) {
    try {
      let record;
      await this.prepare("records", store => {
        store.get([this.cid, id]).onsuccess = e => (record = e.target.result);
      });
      return record;
    } catch (e) {
      this._handleError("get", e);
    }
  }

  /**
   * Lists all records from the IndexedDB database.
   *
   * @override
   * @param  {Object} params  The filters and order to apply to the results.
   * @return {Promise}
   */
  async list(params = { filters: {} }) {
    const { filters } = params;
    try {
      let results = [];
      await this.prepare("records", store => {
        createListRequest(this.cid, store, filters, _results => {
          // we have received all requested records that match the filters,
          // we now park them within current scope and hide the `_cid` attribute.
          results = _results.map(r => omitKeys(r, ["_cid"]));
        });
      });
      // The resulting list of records is sorted.
      // XXX: with some efforts, this could be fully implemented using IDB API.
      return params.order ? sortObjects(params.order, results) : results;
    } catch (e) {
      this._handleError("list", e);
    }
  }

  /**
   * Store the lastModified value into metadata store.
   *
   * @override
   * @param  {Number}  lastModified
   * @return {Promise}
   */
  async saveLastModified(lastModified) {
    const value = parseInt(lastModified, 10) || null;
    try {
      await this.prepare(
        "timestamps",
        store => store.put({ cid: this.cid, value }),
        { mode: "readwrite" }
      );
      return value;
    } catch (e) {
      this._handleError("saveLastModified", e);
    }
  }

  /**
   * Retrieve saved lastModified value.
   *
   * @override
   * @return {Promise}
   */
  async getLastModified() {
    try {
      let entry = null;
      await this.prepare("timestamps", store => {
        store.get(this.cid).onsuccess = e => (entry = e.target.result);
      });
      return entry ? entry.value : null;
    } catch (e) {
      this._handleError("getLastModified", e);
    }
  }

  /**
   * Load a dump of records exported from a server.
   *
   * @abstract
   * @param  {Array} records The records to load.
   * @return {Promise}
   */
  async loadDump(records) {
    try {
      await this.execute(transaction => {
        records.forEach(record => transaction.update(record));
      });
      const previousLastModified = await this.getLastModified();
      const lastModified = Math.max(
        ...records.map(record => record.last_modified)
      );
      if (lastModified > previousLastModified) {
        await this.saveLastModified(lastModified);
      }
      return records;
    } catch (e) {
      this._handleError("loadDump", e);
    }
  }
}

/**
 * IDB transaction proxy.
 *
 * @param  {IDB} adapter        The call IDB adapter
 * @param  {IDBStore} store     The IndexedDB database store.
 * @param  {Array}    preloaded The list of records to make available to
 *                              get() (default: []).
 * @return {Object}
 */
function transactionProxy(adapter, store, preloaded = []) {
  const _cid = adapter.cid;
  return {
    create(record) {
      store.add({ ...record, _cid });
    },

    update(record) {
      store.put({ ...record, _cid });
    },

    delete(id) {
      store.delete([_cid, id]);
    },

    get(id) {
      return preloaded[id];
    },
  };
}

/**
 * Up to version 10.X of kinto.js, each collection had its own collection.
 * The database name was `${bid}/${cid}` (eg. `"blocklists/certificates"`)
 * and contained only one store with the same name.
 */
async function migrationRequired(dbName) {
  let exists = true;
  const db = await open(dbName, {
    version: 1,
    onupgradeneeded: event => {
      exists = false;
    },
  });

  // Check that the DB we're looking at is really a legacy one,
  // and not some remainder of the open() operation above.
  exists &= db.objectStoreNames.contains("__meta__");

  if (!exists) {
    db.close();
    // Testing the existence creates it, so delete it :)
    await deleteDatabase(dbName);
    return null;
  }

  console.warn(`${dbName}: old IndexedDB database found.`);
  try {
    // Scan all records.
    let records;
    await execute(db, dbName, store => {
      store.openCursor().onsuccess = cursorHandlers.all(
        {},
        res => (records = res)
      );
    });
    console.log(`${dbName}: found ${records.length} records.`);

    // Check if there's a entry for this.
    let timestamp = null;
    await execute(db, "__meta__", store => {
      store.get(`${dbName}-lastModified`).onsuccess = e => {
        timestamp = e.target.result ? e.target.result.value : null;
      };
    });
    // Some previous versions, also used to store the timestamps without prefix.
    if (!timestamp) {
      await execute(db, "__meta__", store => {
        store.get("lastModified").onsuccess = e => {
          timestamp = e.target.result ? e.target.result.value : null;
        };
      });
    }
    console.log(`${dbName}: ${timestamp ? "found" : "no"} timestamp.`);

    // Those will be inserted in the new database/schema.
    return { records, timestamp };
  } catch (e) {
    console.error(e);
    return null;
  } finally {
    db.close();
  }
}
