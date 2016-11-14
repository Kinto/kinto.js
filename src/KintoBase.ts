"use strict";

import Collection from "./collection";
import BaseAdapter from "./adapters/base";

const DEFAULT_BUCKET_NAME = "default";
const DEFAULT_REMOTE = "http://localhost:8888/v1";


interface KintoOptions {
  events?;
  adapter?;
  adapterOptions?;
  dbPrefix?;
  remote?;
  headers?;
  requestMode?
  timeout?;
  ApiClass?;
  bucket?;
}

/**
 * KintoBase class.
 */
export default class KintoBase {

  private _options: KintoOptions;
  api;
  events;
  /**
   * Provides a public access to the base adapter class. Users can create a
   * custom DB adapter by extending {@link BaseAdapter}.
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
   * - `{String}`       `remote`         The server URL to use.
   * - `{String}`       `bucket`         The collection bucket name.
   * - `{EventEmitter}` `events`         Events handler.
   * - `{BaseAdapter}`  `adapter`        The base DB adapter class.
   * - `{Object}`       `adapterOptions` Options given to the adapter.
   * - `{String}`       `dbPrefix`       The DB name prefix.
   * - `{Object}`       `headers`        The HTTP headers to use.
   * - `{String}`       `requestMode`    The HTTP CORS mode to use.
   * - `{Number}`       `timeout`        The requests timeout in ms (default: `5000`).
   *
   * @param  {Object} options The options object.
   */
  constructor(options={}) {
    const defaults = {
      bucket: DEFAULT_BUCKET_NAME,
      remote: DEFAULT_REMOTE,
    };
    this._options = {...defaults, ...options};
    if (!this._options.adapter) {
      throw new Error("No adapter provided");
    }

    const {remote, events, headers, requestMode, timeout, ApiClass} = this._options;

    // public properties

    /**
     * The kinto HTTP client instance.
     * @type {KintoClient}
     */
    this.api = new ApiClass(remote, {events, headers, requestMode, timeout});
    /**
     * The event emitter instance.
     * @type {EventEmitter}
     */
    this.events = this._options.events;
  }

  /**
   * Creates a {@link Collection} instance. The second (optional) parameter
   * will set collection-level options like e.g. `remoteTransformers`.
   *
   * @param  {String} collName The collection name.
   * @param  {Object} options  May contain the following fields:
   *                           remoteTransformers: Array<RemoteTransformer>
   * @return {Collection}
   */
  collection(collName, options = ({} as any)) {
    if (!collName) {
      throw new Error("missing collection name");
    }

    const bucket = this._options.bucket;
    return new Collection(bucket, collName, this.api, {
      events:              this._options.events,
      adapter:             this._options.adapter,
      adapterOptions:      this._options.adapterOptions,
      dbPrefix:            this._options.dbPrefix,
      idSchema:            options.idSchema,
      remoteTransformers:  options.remoteTransformers,
      hooks:               options.hooks,
    });
  }
}
