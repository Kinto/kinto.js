"use strict";

import BaseAdapter from "./base.js";
import { filterObject, omitKeys, sortObjects } from "../utils";

const INDEXED_FIELDS = ["id", "_status", "last_modified"];

/**
 * IDB cursor handlers.
 * @type {Object}
 */
const cursorHandlers = {
  all(filters, done) {
    const results = [];
    return function(event) {
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

  in(values, done) {
    if (values.length === 0) {
      return done([]);
    }
    const sortedValues = [].slice.call(values).sort();
    const results = [];
    return function(event) {
      const cursor = event.target.result;
      if (!cursor) {
        done(results);
        return;
      }
      const { key, value } = cursor;
      let i = 0;
      while (key > sortedValues[i]) {
        // The cursor has passed beyond this key. Check next.
        ++i;
        if (i === sortedValues.length) {
          done(results); // There is no next. Stop searching.
          return;
        }
      }
      if (key === sortedValues[i]) {
        results.push(value);
        cursor.continue();
      } else {
        cursor.continue(sortedValues[i]);
      }
    };
  },
};

/**
 * Return an IndexedDB filter equivalent to startsWith(str)
 * https://hacks.mozilla.org/2014/06/breaking-the-borders-of-indexeddb/
 *
 * @param str {String}
 * @return {IDBKeyRange}
 */
function startsWith(str) {
  return IDBKeyRange.bound(str, str + "uffff", false, false);
}

/**
 * Extract from filters definition the first indexed field. Since indexes were
 * created on single-columns, extracting a single one makes sense.
 *
 * @param  {Object} filters The filters object.
 * @return {String|undefined}
 */
function findIndexedField(filters) {
  const filteredFields = Object.keys(filters);
  const indexedFields = filteredFields.filter(field => {
    return INDEXED_FIELDS.includes(field);
  });
  return indexedFields[0];
}

/**
 * Creates an IDB request and attach it the appropriate cursor event handler to
 * perform a list query.
 *
 * Multiple matching values are handled by passing an array.
 *
 * @param  {IDBStore}         store      The IDB store.
 * @param  {String|undefined} indexField The indexed field to query, if any.
 * @param  {Any}              value      The value to filter, if any.
 * @param  {Object}           filters    More filters.
 * @param  {Function}         done       The operation completion handler.
 * @return {IDBRequest}
 */
function createListRequest(keyBase, store, indexField, value, filters, done) {
  if (!indexField) {
    // Get all records.
    const request = store.index("key").openCursor(startsWith(`${keyBase}/`));
    request.onsuccess = cursorHandlers.all(filters, done);
    return request;
  }

  const doneFiltered = results => {
    // XXX: we filter records for this collection here aftewards,
    // whereas it should be a lot better to filter earlier, like
    // WHERE _key.startsWith(this.keyBase) AND property == 42. But although
    // I have some experience with databases and Web APIs, I could not figure
    // out how to do this with the IndexedDB API and official docs yet.
    done(results.filter(r => r._key.indexOf(`${keyBase}/`) === 0));
  };

  // WHERE IN equivalent clause
  if (Array.isArray(value)) {
    const request = store.index(indexField).openCursor();
    request.onsuccess = cursorHandlers.in(value, doneFiltered);
    return request;
  }

  // WHERE field = value clause
  const request = store.index(indexField).openCursor(IDBKeyRange.only(value));
  request.onsuccess = cursorHandlers.all(filters, doneFiltered);
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
   * @param  {String} keyBase  The key base for this collection (eg. `bid/cid`)
   * @param  {Object} options
   * @param  {String} options.dbName The IndexedDB name (default: `"KintoDB"`)
   */
  constructor(keyBase, options = {}) {
    super();

    this.keyBase = keyBase;
    this.dbName = options.dbName || "KintoDB";

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
  open() {
    if (this._db) {
      return Promise.resolve(this);
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 2);
      request.onupgradeneeded = event => {
        // DB object
        const db = event.target.result;
        db.onerror = event => reject(event.target.error);

        if (event.oldVersion == 1) {
          // Version 1 is the first version of the kinto.js database.
          // XXX: Handle data migration.
          // transaction = event.target.transaction;
          // https://stackoverflow.com/a/16657164
        }

        // Records store
        const recordsStore = db.createObjectStore("records", {
          keyPath: "_key",
        });
        recordsStore.createIndex("key", "_key", { unique: true });
        // Record id (generated by IdSchema, UUID by default)
        recordsStore.createIndex("id", "id");
        // Local record status ("synced", "created", "updated", "deleted")
        recordsStore.createIndex("_status", "_status");
        // Last modified field
        recordsStore.createIndex("last_modified", "last_modified");

        // Timestamps store
        const timestampsStore = db.createObjectStore("timestamps", {
          keyPath: "cid",
        });
        timestampsStore.createIndex("cid", "cid", { unique: true });
      };
      request.onerror = event => reject(event.target.error);
      request.onsuccess = event => {
        this._db = event.target.result;
        resolve(this);
      };
    });
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
   * @param  {String}      mode  Transaction mode ("readwrite" or undefined)
   * @return {Object}
   */
  prepare(name, mode = undefined) {
    // On Safari, calling IDBDatabase.transaction with mode == undefined raises
    // a TypeError.
    const transaction = mode
      ? this._db.transaction([name], mode)
      : this._db.transaction([name]);
    const store = transaction.objectStore(name);
    return { transaction, store };
  }

  /**
   * Deletes every records in the current collection.
   *
   * @override
   * @return {Promise}
   */
  async clear() {
    try {
      await this.open();
      return new Promise((resolve, reject) => {
        const { transaction, store } = this.prepare("records", "readwrite");
        store.clear();
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = () => resolve();
      });
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
   * db.execute(transaction => {
   *   transaction.create({id: 1, title: "foo"});
   *   transaction.update({id: 2, title: "bar"});
   *   transaction.delete(3);
   *   return "foo";
   * })
   *   .catch(console.error.bind(console));
   *   .then(console.log.bind(console)); // => "foo"
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
    await this.open();
    return new Promise((resolve, reject) => {
      // Start transaction.
      const { transaction, store } = this.prepare("records", "readwrite");
      // Preload specified records using index.
      const keys = options.preload.map(id => `${this.keyBase}/${id}`);
      store
        .index("key")
        .openCursor(
          startsWith(`${this.keyBase}/`)
        ).onsuccess = cursorHandlers.in(keys, records => {
        // Store obtained records by id.
        const preloaded = records.reduce((acc, record) => {
          acc[record.id] = omitKeys(record, ["_key"]);
          return acc;
        }, {});
        // Expose a consistent API for every adapter instead of raw store methods.
        const proxy = transactionProxy(this, store, preloaded);
        // The callback is executed synchronously within the same transaction.
        let result;
        try {
          result = callback(proxy);
        } catch (e) {
          transaction.abort();
          reject(e);
        }
        if (result instanceof Promise) {
          // XXX: investigate how to provide documentation details in error.
          reject(new Error("execute() callback should not return a Promise."));
        }
        // XXX unsure if we should manually abort the transaction on error
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = event => resolve(result);
      });
    });
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
      await this.open();
      return new Promise((resolve, reject) => {
        const { transaction, store } = this.prepare("records");
        const request = store.get(`${this.keyBase}/${id}`);
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = () => resolve(request.result);
      });
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
    const indexField = findIndexedField(filters);
    const value = filters[indexField];
    try {
      await this.open();
      const results = await new Promise((resolve, reject) => {
        let results = [];
        // If `indexField` was used already, don't filter again.
        const remainingFilters = omitKeys(filters, indexField);

        const { transaction, store } = this.prepare("records");
        createListRequest(
          this.keyBase,
          store,
          indexField,
          value,
          remainingFilters,
          _results => {
            // we have received all requested records that match the filters,
            // we now park them within current scope and hide the `_key` attribute.
            results = _results.map(r => omitKeys(r, ["_key"]));
          }
        );
        transaction.onerror = event => reject(new Error(event.target.error));
        transaction.oncomplete = event => resolve(results);
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
    await this.open();
    return new Promise((resolve, reject) => {
      const { transaction, store } = this.prepare("timestamps", "readwrite");
      store.put({ cid: this.keyBase, value: value });
      transaction.onerror = event => reject(event.target.error);
      transaction.oncomplete = event => resolve(value);
    });
  }

  /**
   * Retrieve saved lastModified value.
   *
   * @override
   * @return {Promise}
   */
  async getLastModified() {
    await this.open();
    return new Promise((resolve, reject) => {
      const { transaction, store } = this.prepare("timestamps");
      const request = store.get(this.keyBase);
      transaction.onerror = event => reject(event.target.error);
      transaction.oncomplete = event => {
        resolve((request.result && request.result.value) || null);
      };
    });
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
  return {
    create(record) {
      store.add({ ...record, _key: `${adapter.keyBase}/${record.id}` });
    },

    update(record) {
      store.put({ ...record, _key: `${adapter.keyBase}/${record.id}` });
    },

    delete(id) {
      store.delete(`${adapter.keyBase}/${id}`);
    },

    get(id) {
      return preloaded[id];
    },
  };
}
