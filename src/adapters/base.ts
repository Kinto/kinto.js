"use strict";

/**
 * Interface to provide filtering and ordering parameters to the list function
 */
export interface ListParameters {
  filters?: Object;
  order?: string;
}

/**
 * Base db adapter.
 *
 * @abstract
 */
export default class BaseAdapter {

  protected _db:  IDBDatabase;

  // public properties
  /**
   * The database name.
   * @type {String}
   */
  public dbname: string;

  /**
   * Opens a connection to the database.
   *
   * @abstract
   * @return {Promise}
   */
  open(): Promise<any> {
    return Promise.resolve();
  }

  /**
   * Closes current connection to the database.
   *
   * @abstract
   * @return {Promise}
   */
  close(): Promise<any> {
    return Promise.resolve();
  }

  /**
   * Deletes every records present in the database.
   *
   * @abstract
   * @return {Promise}
   */
  clear(): Promise<any> {
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
  execute(callback: Function, options: Object = {preload: []}): Promise<any> {
    throw new Error("Not Implemented.");
  }

  /**
   * Retrieve a record by its primary key from the database.
   *
   * @abstract
   * @param  {String} id The record id.
   * @return {Promise}
   */
  get(id: string): Promise<any> {
    throw new Error("Not Implemented.");
  }

  /**
   * Lists all records from the database.
   *
   * @abstract
   * @param  {Object} params  The filters and order to apply to the results.
   * @return {Promise}
   */
  list(params: ListParameters = {filters: {}, order: ""}):Promise<any> {
    throw new Error("Not Implemented.");
  }

  /**
   * Store the lastModified value.
   *
   * @abstract
   * @param  {Number}  lastModified
   * @return {Promise}
   */
  saveLastModified(lastModified): Promise<any> {
    throw new Error("Not Implemented.");
  }

  /**
   * Retrieve saved lastModified value.
   *
   * @abstract
   * @return {Promise}
   */
  getLastModified(): Promise<number> {
    throw new Error("Not Implemented.");
  }

  /**
   * Load a dump of records exported from a server.
   *
   * @abstract
   * @return {Promise}
   */
  loadDump(records): Promise<any> {
    throw new Error("Not Implemented.");
  }
}
