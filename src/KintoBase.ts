import Api from "kinto-http";
import Collection from "./collection";
import BaseAdapter from "./adapters/base";
import {
  IdSchema,
  RemoteTransformer,
  Hooks,
  RecordStatus,
  Emitter,
} from "./types";

const DEFAULT_BUCKET_NAME = "default";
const DEFAULT_REMOTE = "http://localhost:8888/v1";
const DEFAULT_RETRY = 1;

export interface KintoBaseOptions {
  remote?: string;
  bucket?: string;
  events?: Emitter;
  adapter?: (
    dbName: string,
    options?: { dbName?: string; migrateOldData?: boolean }
  ) => BaseAdapter<any>;
  adapterOptions?: object;
  headers?: Record<string, string>;
  retry?: number;
  requestMode?: RequestMode;
  timeout?: number;
}

/**
 * KintoBase class.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
export default class KintoBase<
  B extends { id: string; last_modified?: number; _status?: RecordStatus }
> {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  private _options: KintoBaseOptions;
  private _api: Api | null;
  public events?: Emitter;
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
   * - `{Object}`       `headers`        The HTTP headers to use.
   * - `{Object}`       `retry`          Number of retries when the server fails to process the request (default: `1`)
   * - `{String}`       `requestMode`    The HTTP CORS mode to use.
   * - `{Number}`       `timeout`        The requests timeout in ms (default: `5000`).
   *
   * @param  {Object} options The options object.
   */
  constructor(options: KintoBaseOptions = {}) {
    const defaults = {
      bucket: DEFAULT_BUCKET_NAME,
      remote: DEFAULT_REMOTE,
      retry: DEFAULT_RETRY,
    };
    this._options = { ...defaults, ...options };
    if (!this._options.adapter) {
      throw new Error("No adapter provided");
    }
    this._api = null;

    /**
     * The event emitter instance.
     * @type {EventEmitter}
     */
    this.events = this._options.events;
  }

  get ApiClass(): typeof Api {
    throw new Error("ApiClass() must be implemented by subclasses.");
  }

  /**
   * The kinto HTTP client instance.
   * @type {KintoClient}
   */
  get api() {
    const { events, headers, remote, requestMode, retry, timeout } =
      this._options;

    if (!this._api) {
      this._api = new this.ApiClass(remote!, {
        events,
        headers,
        requestMode,
        retry,
        timeout,
      });
    }

    return this._api;
  }

  /**
   * Creates a {@link Collection} instance. The second (optional) parameter
   * will set collection-level options like e.g. `remoteTransformers`.
   *
   * @param  {String} collName The collection name.
   * @param  {Object} [options={}]                 Extra options or override client's options.
   * @param  {Object} [options.idSchema]           IdSchema instance (default: UUID)
   * @param  {Object} [options.remoteTransformers] Array<RemoteTransformer> (default: `[]`])
   * @param  {Object} [options.hooks]              Array<Hook> (default: `[]`])
   * @param  {Object} [options.localFields]        Array<Field> (default: `[]`])
   * @return {Collection}
   */
  collection<
    C extends {
      id: string;
      last_modified?: number;
      _status?: RecordStatus;
    } = any
  >(
    collName: string,
    options: {
      adapter?: (
        dbName: string,
        options?: { dbName?: string; migrateOldData?: boolean }
      ) => BaseAdapter<C>;
      idSchema?: IdSchema;
      remoteTransformers?: RemoteTransformer[];
      hooks?: Hooks<C>;
      localFields?: string[];
    } = {}
  ): Collection<C> {
    if (!collName) {
      throw new Error("missing collection name");
    }
    const { bucket, events, adapter, adapterOptions } = {
      ...this._options,
      ...options,
    };
    const { idSchema, remoteTransformers, hooks, localFields } = options;

    return new Collection<C>(bucket!, collName, this, {
      events,
      adapter,
      adapterOptions,
      idSchema,
      remoteTransformers,
      hooks,
      localFields,
    });
  }
}
