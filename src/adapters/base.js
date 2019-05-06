"use strict";

/**
 * Base db adapter.
 *
 * @abstract
 */
export default class BaseAdapter {
  /**
   * Deletes every records present in the database.
   *
   * @abstract
   * @return {Promise}
   */
  clear() {
    throw new Error("Not Implemented.");
  }

  /**
   * Executes a batch of operations within a single transaction.
   *
   * @abstract
   * @param  {Function} callback The operation callback.
   * @param  {Object}   options  The options object.
   * @return {Promise}
   */
  execute(callback, options = { preload: [] }) {
    throw new Error("Not Implemented.");
  }

  /**
   * Retrieve a record by its primary key from the database.
   *
   * @abstract
   * @param  {String} id The record id.
   * @return {Promise}
   */
  get(id) {
    throw new Error("Not Implemented.");
  }

  /**
   * Lists all records from the database.
   *
   * @abstract
   * @param  {Object} params  The filters and order to apply to the results.
   * @return {Promise}
   */
  list(params = { filters: {}, order: "" }) {
    throw new Error("Not Implemented.");
  }

  /**
   * Store the lastModified value.
   *
   * @abstract
   * @param  {Number}  lastModified
   * @return {Promise}
   */
  saveLastModified(lastModified) {
    throw new Error("Not Implemented.");
  }

  /**
   * Retrieve saved lastModified value.
   *
   * @abstract
   * @return {Promise}
   */
  getLastModified() {
    throw new Error("Not Implemented.");
  }

  /**
   * Load records in bulk that were exported from a server.
   *
   * @abstract
   * @param  {Array} records The records to load.
   * @return {Promise}
   */
  importBulk(records) {
    throw new Error("Not Implemented.");
  }

  /**
   * Load a dump of records exported from a server.
   *
   * @deprecated Use {@link importBulk} instead.
   * @abstract
   * @param  {Array} records The records to load.
   * @return {Promise}
   */
  loadDump(records) {
    throw new Error("Not Implemented.");
  }

  saveMetadata(metadata) {
    throw new Error("Not Implemented.");
  }

  getMetadata() {
    throw new Error("Not Implemented.");
  }
}
