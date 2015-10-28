"use strict";

/**
 * Base db adapter.
 *
 * @abstract
 */
export default class BaseAdapter {
  /**
   * Opens a connection to the database.
   *
   * @abstract
   * @return {Promise}
   */
  open() {
    return Promise.resolve();
  }

  /**
   * Closes current connection to the database.
   *
   * @abstract
   * @return {Promise}
   */
  close() {
    return Promise.resolve();
  }

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
   * Adds a record to the database.
   *
   * Note: An id value is required.
   *
   * @abstract
   * @param  {Object} record The record object, including an id.
   * @return {Promise}
   */
  create(record) {
    throw new Error("Not Implemented.");
  }

  /**
   * Updates a record from the IndexedDB database.
   *
   * @abstract
   * @param  {Object} record
   * @return {Promise}
   */
  update(record) {
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
   * Deletes a record from the database.
   *
   * @abstract
   * @param  {String} id The record id.
   * @return {Promise}
   */
  delete(id) {
    throw new Error("Not Implemented.");
  }

  /**
   * Lists all records from the database.
   *
   * @abstract
   * @return {Promise}
   */
  list() {
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
}
