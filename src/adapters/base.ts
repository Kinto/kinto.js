import { KintoObject, KintoIdObject } from "kinto-http";

export interface StorageProxy {
  create: (record: KintoIdObject) => void;
  update: (record: KintoIdObject) => any;
  delete: (id: string) => void;
  get: (id: string) => KintoObject;
}

export abstract class AbstractBaseAdapter {
  abstract clear(): Promise<void>;
  abstract execute<T>(
    callback: (proxy: StorageProxy) => T,
    options: { preload: string[] }
  ): Promise<T>;
  abstract get(id: string): Promise<any>;
  abstract list(params: {
    filters: { [key: string]: any };
    order: string;
  }): Promise<any[]>;
  abstract saveLastModified(lastModified: number): Promise<number | null>;
  abstract getLastModified(): Promise<number | null>;
  abstract importBulk(records: KintoObject[]): Promise<KintoObject[]>;
  abstract loadDump(records: KintoObject[]): Promise<KintoObject[]>;
  abstract saveMetadata(metadata: {
    [key: string]: any;
  }): Promise<{ [key: string]: any }>;
  abstract getMetadata<T>(): Promise<T>;
}

/**
 * Base db adapter.
 *
 * @abstract
 */
export default class BaseAdapter implements AbstractBaseAdapter {
  /**
   * Deletes every records present in the database.
   *
   * @abstract
   * @return {Promise}
   */
  clear(): Promise<void> {
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
  execute<T>(
    callback: (proxy: StorageProxy) => T,
    options: { preload: string[] } = { preload: [] }
  ): Promise<T> {
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
  list(
    params: { filters: { [key: string]: any }; order: string } = {
      filters: {},
      order: "",
    }
  ): Promise<any[]> {
    throw new Error("Not Implemented.");
  }

  /**
   * Store the lastModified value.
   *
   * @abstract
   * @param  {Number}  lastModified
   * @return {Promise}
   */
  saveLastModified(lastModified: number): Promise<number | null> {
    throw new Error("Not Implemented.");
  }

  /**
   * Retrieve saved lastModified value.
   *
   * @abstract
   * @return {Promise}
   */
  getLastModified(): Promise<number | null> {
    throw new Error("Not Implemented.");
  }

  /**
   * Load records in bulk that were exported from a server.
   *
   * @abstract
   * @param  {Array} records The records to load.
   * @return {Promise}
   */
  importBulk(records: KintoObject[]): Promise<KintoObject[]> {
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
  loadDump(records: KintoObject[]): Promise<KintoObject[]> {
    throw new Error("Not Implemented.");
  }

  saveMetadata(metadata: {
    [key: string]: any;
  }): Promise<{ [key: string]: any }> {
    throw new Error("Not Implemented.");
  }

  getMetadata<T>(): Promise<T> {
    throw new Error("Not Implemented.");
  }
}