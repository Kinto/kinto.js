"use strict";

export default class BaseAdapter {
  /**
   * Deletes every records present in the database..
   *
   * @return {Promise}
   */
  clear() {
    throw new Error("Implement me.");
  }

  /**
   * Adds a record to the IndexedDB database.
   *
   * Note: An id value is required.
   *
   * @param  {Object} record The record object, including an id.
   * @return {Promise}
   */
  create(record) {
    throw new Error("Implement me.");
  }

  /**
   * Updates a record from the IndexedDB database.
   *
   * @param  {Object} record
   * @return {Promise}
   */
  update(record) {
    throw new Error("Implement me.");
  }

  /**
   * Retrieve a record by its primary key from the database.
   *
   * @param  {String} id The record id.
   * @return {Promise}
   */
  get(id) {
    throw new Error("Implement me.");
  }

  /**
   * Deletes a record from the database.
   *
   * @param  {String} id The record id.
   * @return {Promise}
   */
  delete(id) {
    throw new Error("Implement me.");
  }

  /**
   * Lists all records from the database.
   *
   * @return {Promise}
   */
  list() {
    throw new Error("Implement me.");
  }

  /**
   * Store the lastModified value.
   *
   * @param  {Number}  lastModified
   * @param  {Object}  options
   * @return {Promise}
   */
  saveLastModified(lastModified) {
    throw new Error("Implement me.");
  }

  /**
   * Retrieve saved lastModified value.
   *
   * @return {Promise}
   */
  getLastModified() {
    throw new Error("Implement me.");
  }
}
