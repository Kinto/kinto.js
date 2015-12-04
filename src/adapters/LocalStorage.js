"use strict";

import BaseAdapter from "./base.js";

const root = typeof window === "object" ? window : global;

// Only load localStorage in a nodejs environment
if (!root.hasOwnProperty("localStorage")) {
  root.localStorage = require("localStorage");
}

/**
 * LocalStorage adapter.
 */
export default class LocalStorage extends BaseAdapter {
  /**
   * Constructor.
   *
   * @param  {String} dbname The database nale.
   */
  constructor(dbname) {
    super();
    this._db = null;
    this._keyStoreName = `${this.dbname}/__keys`;
    this._metaPrefix = `${this.dbname}/meta`;
    // public properties
    /**
     * The database name.
     * @type {String}
     */
    this.dbname = dbname;
  }

  _handleError(method, err) {
    const error = new Error(method + "() " + err.message);
    error.stack = err.stack;
    return Promise.reject(error);
  }

  /**
   * Retrieve all existing keys.
   *
   * @return {Array}
   */
  get keys() {
    return JSON.parse(localStorage.getItem(this._keyStoreName)) || [];
  }

  /**
   * Set keys.
   *
   * @param  {Array} keys
   */
  set keys(keys) {
    localStorage.setItem(this._keyStoreName, JSON.stringify(keys));
  }

  /**
   * Opens a connection to the database. Doesn't do anything as LocalStorage
   * database doesn't have to be opened.
   *
   * @override
   * @return {Promise}
   */
  open() {
    return super.open();
  }

  /**
   * Closes current connection to the database. Doesn't do anything as LocalStorage
   * database can't be closed.
   *
   * @override
   * @return {Promise}
   */
  close() {
    return super.close();
  }

  /**
   * Deletes every records in the current collection.
   *
   * @override
   * @return {Promise}
   */
  clear() {
    try {
      localStorage.clear();
      return Promise.resolve();
    } catch (err) {
      return this._handleError("clear", err);
    }
  }

  /**
   * Adds a record to the localStorage datastore.
   *
   * Note: An id value is required.
   *
   * @override
   * @param  {Object} record The record object, including an id.
   * @return {Promise}
   */
  create(record) {
    if (this.keys.indexOf(record.id) !== -1) {
      return Promise.reject(new Error("Exists."));
    }
    try {
      localStorage.setItem(`${this.dbname}/${record.id}`, JSON.stringify(record));
      this.keys = this.keys.concat(record.id);
      return Promise.resolve(record);
    } catch(err) {
      return this._handleError("create", err);
    }
  }

  /**
   * Updates a record from the localStorage datastore.
   *
   * @override
   * @param  {Object} record
   * @return {Promise}
   */
  update(record) {
    if (this.keys.indexOf(record.id) === -1) {
      return Promise.reject(new Error("Doesn't exist."));
    }
    try {
      localStorage.setItem(`${this.dbname}/${record.id}`, JSON.stringify(record));
      return Promise.resolve(record);
    } catch(err) {
      return this._handleError("update", err);
    }
  }

  /**
   * Retrieve a record by its primary key from the localStorage datastore.
   *
   * @override
   * @param  {String} id The record id.
   * @return {Promise}
   */
  get(id) {
    try {
      return Promise.resolve(
        JSON.parse(localStorage.getItem(`${this.dbname}/${id}`)) || undefined);
    } catch(err) {
      return this._handleError("get", err);
    }
  }

  /**
   * Deletes a record from the localStorage datastore.
   *
   * @override
   * @param  {String} id The record id.
   * @return {Promise}
   */
  delete(id) {
    try {
      localStorage.removeItem(`${this.dbname}/${id}`);
      this.keys = this.keys.filter(key => key !== id);
      return Promise.resolve(id);
    } catch(err) {
      return this._handleError("delete", err);
    }
  }

  /**
   * Lists all records from the localStorage datastore.
   *
   * @override
   * @return {Promise}
   */
  list() {
    try {
      return Promise.resolve(this.keys.map(id => {
        return JSON.parse(localStorage.getItem(`${this.dbname}/${id}`));
      }));
    } catch(err) {
      return this._handleError("list", err);
    }
  }

  /**
   * Store the lastModified value into metadata store.
   *
   * @override
   * @param  {Number}  lastModified
   * @return {Promise}
   */
  saveLastModified(lastModified) {
    const value = parseInt(lastModified, 10);
    return this.saveMetaProperty("lastModified", value);
  }

  /**
   * Retrieve saved lastModified value.
   *
   * @override
   * @return {Promise}
   */
  getLastModified() {
    return this.getMetaProperty("lastModified")
      .then(lastModified => parseInt(lastModified, 10) || null);
  }

  /**
   * Saves a meta property.
   *
   * @param  {String} name
   * @param  {Any}    value
   * @return {Promise}
   */
  saveMetaProperty(name, value) {
    try {
      const key = `${this._metaPrefix}name`;
      localStorage.setItem(key, JSON.stringify(value));
      return Promise.resolve(value);
    } catch(err) {
      return this._handleError("saveMetaProperty", err);
    }
  }

  /**
   * Retrieves a meta property value.
   *
   * @param  {String} name
   * @return {Promise}
   */
  getMetaProperty(name) {
    try {
      const key = `${this._metaPrefix}name`;
      const lastModified = JSON.parse(localStorage.getItem(key));
      return Promise.resolve(parseInt(lastModified, 10) || null);
    } catch(err) {
      return this._handleError("getMetaProperty", err);
    }
  }

  /**
   * Load a dump of records exported from a server.
   *
   * @abstract
   * @return {Promise}
   */
  loadDump(records) {
    try {
      records.forEach(record => {
        localStorage.setItem(`${this.dbname}/${record.id}`, JSON.stringify(record));
        if (this.keys.indexOf(record.id) === -1) {
          this.keys = this.keys.concat(record.id);
        }
      });
      const lastModified = Math.max(...records.map(record => record.last_modified));
      return this.getLastModified()
        .then(previousLastModified => {
          if (lastModified > previousLastModified) {
            return this.saveLastModified(lastModified);
          }
        })
        .then(() => records);
    } catch(err) {
      return this._handleError("loadDump", err);
    }
  }
}
