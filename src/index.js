"use strict";

import "babel/polyfill";
import "isomorphic-fetch";

import { EventEmitter } from "events";
import Api from "./api";
import Collection from "./collection";
import BaseAdapter from "./adapters/base";
import LocalStorage from "./adapters/LocalStorage";
import IDB from "./adapters/IDB";

const DEFAULT_BUCKET_NAME = "default";
const DEFAULT_REMOTE = "http://localhost:8888/v1";

/**
 * Kinto class.
 */
export default class Kinto {
  /**
   * Provides a public access to the base adapter classes. Users can create
   * a custom DB adapter by extending BaseAdapter.
   *
   * @return {Object}
   */
  static get adapters() {
    return {
      BaseAdapter: BaseAdapter,
      LocalStorage: LocalStorage,
      IDB: IDB,
    };
  }

  /**
   * Synchronization strategies. Available strategies are:
   *
   * - `MANUAL`: Conflicts will be reported in a dedicated array.
   * - `SERVER_WINS`: Conflicts are resolved using remote data.
   * - `CLIENT_WINS`: Conflicts are resolved using local data.
   *
   * @return {Object}
   */
  static get syncStrategy() {
    return Collection.strategy;
  }

  /**
   * Constructor.
   *
   * Options:
   * - {String}       remote   The server URL to use.
   * - {String}       bucket   The collection bucket name.
   * - {EventEmitter} events   Events handler.
   * - {BaseAdapter}  adapter  The base DB adapter class.
   * - {String}       dbPrefix The DB name prefix.
   * - {Object}       headers  The HTTP headers to use.
   * - {String}       requestMode The HTTP CORS mode to use.
   *
   * @param  {Object} options The options object.
   */
  constructor(options={}) {
    const defaults = {
      adapter: Kinto.adapters.IDB,
      bucket: DEFAULT_BUCKET_NAME,
      events: new EventEmitter(),
      remote: DEFAULT_REMOTE,
    };
    this._options = Object.assign(defaults, options);
    this._api = new Api(this._options.remote, {
      headers:     this._options.headers,
      events:      this._options.events,
      requestMode: this._options.requestMode,
    });

    // public properties
    this.events = this._options.events;
  }

  /**
   * Creates a Collection instance. The second (optional) parameter
   * will set collection-level options like e.g. remoteTransformers.
   *
   * @param  {String} collName The collection name.
   * @param  {Object} options May contain the following fields:
   *                          remoteTransformers: Array of RemoteTransformers
   * @return {Collection}
   */
  collection(collName, options = {}) {
    if (!collName) {
      throw new Error("missing collection name");
    }

    const bucket = this._options.bucket;
    return new Collection(bucket, collName, this._api, {
      events:              this._options.events,
      adapter:             this._options.adapter,
      dbPrefix:            this._options.dbPrefix,
      idSchema:            options.idSchema,
      remoteTransformers:  options.remoteTransformers
    });
  }
}
