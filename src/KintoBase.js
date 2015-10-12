"use strict";

import Api from "./api";
import Collection from "./collection";
import BaseAdapter from "./adapters/base";

const DEFAULT_BUCKET_NAME = "default";
const DEFAULT_REMOTE = "http://localhost:8888/v1";

/**
 * KintoBase class.
 */
export default class KintoBase {
  /**
   * Provides a public access to the base adapter classes. Users can create
   * a custom DB adapter by extending BaseAdapter.
   *
   * @type {Object}
   */
  static get adapters() {
    return {
      BaseAdapter: BaseAdapter,
    };
  }

  /**
   * Synchronization strategies. Available strategies are:
   *
   * - `MANUAL`: Conflicts will be reported in a dedicated array.
   * - `SERVER_WINS`: Conflicts are resolved using remote data.
   * - `CLIENT_WINS`: Conflicts are resolved using local data.
   *
   * @type {Object}
   */
  static get syncStrategy() {
    return Collection.strategy;
  }

  /**
   * Constructor.
   *
   * Options:
   * - `{String}`       `remote`      The server URL to use.
   * - `{String}`       `bucket`      The collection bucket name.
   * - `{EventEmitter}` `events`      Events handler.
   * - `{BaseAdapter}`  `adapter`     The base DB adapter class.
   * - `{String}`       `dbPrefix`    The DB name prefix.
   * - `{Object}`       `headers`     The HTTP headers to use.
   * - `{String}`       `requestMode` The HTTP CORS mode to use.
   *
   * @param  {Object} options The options object.
   */
  constructor(options={}) {
    const defaults = {
      bucket: DEFAULT_BUCKET_NAME,
      remote: DEFAULT_REMOTE,
    };
    this._options = Object.assign(defaults, options);
    if (!this._options.adapter) {
      throw new Error("No adapter provided");
    }

    const {remote, events, headers, requestMode} = this._options;
    this._api = new Api(remote, events, {headers, requestMode});

    // public properties
    /**
     * The event emitter instance.
     * @type {EventEmitter}
     */
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
