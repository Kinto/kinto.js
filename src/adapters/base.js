"use strict";

/**
 * Base db adapter.
 *
 * @abstract
 */
export default class BaseAdapter {
  /**
   * Deletes every records present in the database..
   *
   * @return {Promise}
   */
  clear() {
    throw new Error("Not Implemented.");
  }

  // batch() {
  //   return
  // }

  /**
   * Adds a record to the IndexedDB database.
   *
   * Note: An id value is required.
   *
   * @param  {Object} record The record object, including an id.
   * @return {Promise}
   */
  create(record) {
    throw new Error("Not Implemented.");
  }

  /**
   * Updates a record from the IndexedDB database.
   *
   * @param  {Object} record
   * @return {Promise}
   */
  update(record) {
    throw new Error("Not Implemented.");
  }

  /**
   * Retrieve a record by its primary key from the database.
   *
   * @param  {String} id The record id.
   * @return {Promise}
   */
  get(id) {
    throw new Error("Not Implemented.");
  }

  /**
   * Deletes a record from the database.
   *
   * @param  {String} id The record id.
   * @return {Promise}
   */
  delete(id) {
    throw new Error("Not Implemented.");
  }

  /**
   * Lists all records from the database.
   *
   * @return {Promise}
   */
  list() {
    throw new Error("Not Implemented.");
  }

  /**
   * Store the lastModified value.
   *
   * @param  {Number}  lastModified
   * @return {Promise}
   */
  saveLastModified(lastModified) {
    throw new Error("Not Implemented.");
  }

  /**
   * Retrieve saved lastModified value.
   *
   * @return {Promise}
   */
  getLastModified() {
    throw new Error("Not Implemented.");
  }
}
