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
    this._keyLastModified = `${this.dbname}/__lastModified`;
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
   * Deletes every records in the current collection.
   *
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
   * @param  {Number}  lastModified
   * @return {Promise}
   */
  saveLastModified(lastModified) {
    var value = parseInt(lastModified, 10);
    try {
      localStorage.setItem(this._keyLastModified, JSON.stringify(value));
      return Promise.resolve(value);
    } catch(err) {
      return this._handleError("saveLastModified", err);
    }
  }

  /**
   * Retrieve saved lastModified value.
   *
   * @return {Promise}
   */
  getLastModified() {
    try {
      const lastModified = JSON.parse(localStorage.getItem(this._keyLastModified));
      return Promise.resolve(parseInt(lastModified, 10) || undefined);
    } catch(err) {
      return this._handleError("getLastModified", err);
    }
  }
}
