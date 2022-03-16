import {
  partition,
  qsify,
  support,
  nobatch,
  toDataBody,
  cleanUndefinedProperties,
} from "./utils";
import HTTP, { HttpResponse } from "./http";
import endpoints from "./endpoints";
import * as requests from "./requests";
import { aggregate, AggregateResponse } from "./batch";
import Bucket from "./bucket";
import { addEndpointOptions, capable } from "./utils";
import {
  HelloResponse,
  KintoRequest,
  BatchResponse,
  OperationResponse,
  DataResponse,
  Permission,
  KintoIdObject,
  MappableObject,
  KintoObject,
  PermissionData,
  KintoResponse,
  ServerSettings,
  ServerCapability,
  User,
  Emitter,
  HttpMethod,
  FetchFunction,
} from "./types";
import Collection from "./collection";

/**
 * Currently supported protocol version.
 * @type {String}
 */
export const SUPPORTED_PROTOCOL_VERSION = "v1";

export interface KintoClientOptions {
  safe?: boolean;
  events?: Emitter;
  headers?: Record<string, string>;
  retry?: number;
  bucket?: string;
  requestMode?: RequestMode;
  timeout?: number;
  batch?: boolean;
  fetchFunc?: FetchFunction;
}

export interface PaginatedParams {
  sort?: string;
  filters?: Record<string, string | number>;
  limit?: number;
  pages?: number;
  since?: string;
  fields?: string[];
}

export interface PaginationResult<T> {
  last_modified: string | null;
  data: T[];
  next: (nextPage?: string | null) => Promise<PaginationResult<T>>;
  hasNextPage: boolean;
  totalRecords: number;
}

type BaseBatch = (client: KintoClientBase) => void;
type BucketBatch = (client: Bucket) => void;
type CollectionBatch = (client: Collection) => void;

/**
 * High level HTTP client for the Kinto API.
 *
 * @example
 * const client = new KintoClient("https://demo.kinto-storage.org/v1");
 * client.bucket("default")
 *    .collection("my-blog")
 *    .createRecord({title: "First article"})
 *   .then(console.log.bind(console))
 *   .catch(console.error.bind(console));
 */
export default class KintoClientBase {
  private _backoffReleaseTime: number | null;
  private _requests: KintoRequest[];
  private _isBatch: boolean;
  private _retry: number;
  private _safe: boolean;
  private _headers: Record<string, string>;
  public serverInfo: HelloResponse | null;
  public events?: Emitter;
  public http: HTTP;
  public endpoints: typeof endpoints;
  private _remote!: string;
  private _version!: string;

  /**
   * Constructor.
   *
   * @param  {String}       remote  The remote URL.
   * @param  {Object}       [options={}]                  The options object.
   * @param  {Boolean}      [options.safe=true]           Adds concurrency headers to every requests.
   * @param  {EventEmitter} [options.events=EventEmitter] The events handler instance.
   * @param  {Object}       [options.headers={}]          The key-value headers to pass to each request.
   * @param  {Object}       [options.retry=0]             Number of retries when request fails (default: 0)
   * @param  {String}       [options.bucket="default"]    The default bucket to use.
   * @param  {String}       [options.requestMode="cors"]  The HTTP request mode (from ES6 fetch spec).
   * @param  {Number}       [options.timeout=null]        The request timeout in ms, if any.
   * @param  {Function}     [options.fetchFunc=fetch]     The function to be used to execute HTTP requests.
   */
  constructor(remote: string, options: KintoClientOptions) {
    if (typeof remote !== "string" || !remote.length) {
      throw new Error("Invalid remote URL: " + remote);
    }
    if (remote[remote.length - 1] === "/") {
      remote = remote.slice(0, -1);
    }
    this._backoffReleaseTime = null;

    this._requests = [];
    this._isBatch = !!options.batch;
    this._retry = options.retry || 0;
    this._safe = !!options.safe;
    this._headers = options.headers || {};

    // public properties
    /**
     * The remote server base URL.
     * @type {String}
     */
    this.remote = remote;
    /**
     * Current server information.
     * @ignore
     * @type {Object|null}
     */
    this.serverInfo = null;
    /**
     * The event emitter instance. Should comply with the `EventEmitter`
     * interface.
     * @ignore
     * @type {Class}
     */
    this.events = options.events;

    this.endpoints = endpoints;

    const { fetchFunc, requestMode, timeout } = options;
    /**
     * The HTTP instance.
     * @ignore
     * @type {HTTP}
     */
    this.http = new HTTP(this.events, { fetchFunc, requestMode, timeout });
    this._registerHTTPEvents();
  }

  /**
   * The remote endpoint base URL. Setting the value will also extract and
   * validate the version.
   * @type {String}
   */
  get remote(): string {
    return this._remote;
  }

  /**
   * @ignore
   */
  set remote(url: string) {
    let version;
    try {
      version = url.match(/\/(v\d+)\/?$/)![1];
    } catch (err) {
      throw new Error("The remote URL must contain the version: " + url);
    }
    if (version !== SUPPORTED_PROTOCOL_VERSION) {
      throw new Error(`Unsupported protocol version: ${version}`);
    }
    this._remote = url;
    this._version = version;
  }

  /**
   * The current server protocol version, eg. `v1`.
   * @type {String}
   */
  get version(): string {
    return this._version;
  }

  /**
   * Backoff remaining time, in milliseconds. Defaults to zero if no backoff is
   * ongoing.
   *
   * @type {Number}
   */
  get backoff(): number {
    const currentTime = new Date().getTime();
    if (this._backoffReleaseTime && currentTime < this._backoffReleaseTime) {
      return this._backoffReleaseTime - currentTime;
    }
    return 0;
  }

  /**
   * Registers HTTP events.
   * @private
   */
  private _registerHTTPEvents(): void {
    // Prevent registering event from a batch client instance
    if (!this._isBatch && this.events) {
      this.events.on("backoff", (backoffMs) => {
        this._backoffReleaseTime = backoffMs;
      });
    }
  }

  /**
   * Retrieve a bucket object to perform operations on it.
   *
   * @param  {String}  name              The bucket name.
   * @param  {Object}  [options={}]      The request options.
   * @param  {Boolean} [options.safe]    The resulting safe option.
   * @param  {Number}  [options.retry]   The resulting retry option.
   * @param  {Object}  [options.headers] The extended headers object option.
   * @return {Bucket}
   */
  bucket(
    name: string,
    options: {
      safe?: boolean;
      retry?: number;
      headers?: Record<string, string>;
    } = {}
  ): Bucket {
    return new Bucket(this, name, {
      headers: this._getHeaders(options),
      safe: this._getSafe(options),
      retry: this._getRetry(options),
    });
  }

  /**
   * Set client "headers" for every request, updating previous headers (if any).
   *
   * @param {Object} headers The headers to merge with existing ones.
   */
  setHeaders(headers: Record<string, string>): void {
    this._headers = {
      ...this._headers,
      ...headers,
    };
    this.serverInfo = null;
  }

  /**
   * Get the value of "headers" for a given request, merging the
   * per-request headers with our own "default" headers.
   *
   * Note that unlike other options, headers aren't overridden, but
   * merged instead.
   *
   * @private
   * @param {Object} options The options for a request.
   * @returns {Object}
   */
  private _getHeaders(options: {
    headers?: Record<string, string>;
  }): Record<string, string> {
    return {
      ...this._headers,
      ...options.headers,
    };
  }

  /**
   * Get the value of "safe" for a given request, using the
   * per-request option if present or falling back to our default
   * otherwise.
   *
   * @private
   * @param {Object} options The options for a request.
   * @returns {Boolean}
   */
  private _getSafe(options: { safe?: boolean }): boolean {
    return { safe: this._safe, ...options }.safe;
  }

  /**
   * As _getSafe, but for "retry".
   *
   * @private
   */
  private _getRetry(options: { retry?: number }): number {
    return { retry: this._retry, ...options }.retry;
  }

  /**
   * Retrieves the server's "hello" endpoint. This endpoint reveals
   * server capabilities and settings as well as telling the client
   * "who they are" according to their given authorization headers.
   *
   * @private
   * @param  {Object}  [options={}] The request options.
   * @param  {Object}  [options.headers={}] Headers to use when making
   *     this request.
   * @param  {Number}  [options.retry=0]    Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Object, Error>}
   */
  private async _getHello(
    options: {
      retry?: number;
      headers?: Record<string, string>;
    } = {}
  ): Promise<HelloResponse> {
    const path = this.remote + endpoints.root();
    const { json } = await this.http.request<HelloResponse>(
      path,
      { headers: this._getHeaders(options) },
      { retry: this._getRetry(options) }
    );
    return json;
  }

  /**
   * Retrieves server information and persist them locally. This operation is
   * usually performed a single time during the instance lifecycle.
   *
   * @param  {Object}  [options={}] The request options.
   * @param  {Number}  [options.retry=0]    Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Object, Error>}
   */
  async fetchServerInfo(
    options: { retry?: number } = {}
  ): Promise<HelloResponse> {
    if (this.serverInfo) {
      return this.serverInfo;
    }
    this.serverInfo = await this._getHello({ retry: this._getRetry(options) });
    return this.serverInfo;
  }

  /**
   * Retrieves Kinto server settings.
   *
   * @param  {Object}  [options={}] The request options.
   * @param  {Number}  [options.retry=0]    Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Object, Error>}
   */
  @nobatch("This operation is not supported within a batch operation.")
  async fetchServerSettings(
    options: { retry?: number } = {}
  ): Promise<ServerSettings> {
    const { settings } = await this.fetchServerInfo(options);
    return settings;
  }

  /**
   * Retrieve server capabilities information.
   *
   * @param  {Object}  [options={}] The request options.
   * @param  {Number}  [options.retry=0]    Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Object, Error>}
   */
  @nobatch("This operation is not supported within a batch operation.")
  async fetchServerCapabilities(
    options: {
      retry?: number;
    } = {}
  ): Promise<{ [key: string]: ServerCapability }> {
    const { capabilities } = await this.fetchServerInfo(options);
    return capabilities;
  }

  /**
   * Retrieve authenticated user information.
   *
   * @param  {Object}  [options={}] The request options.
   * @param  {Object}  [options.headers={}] Headers to use when making
   *     this request.
   * @param  {Number}  [options.retry=0]    Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Object, Error>}
   */
  @nobatch("This operation is not supported within a batch operation.")
  async fetchUser(
    options: {
      retry?: number;
      headers?: Record<string, string>;
    } = {}
  ): Promise<User | undefined> {
    const { user } = await this._getHello(options);
    return user;
  }

  /**
   * Retrieve authenticated user information.
   *
   * @param  {Object}  [options={}] The request options.
   * @param  {Number}  [options.retry=0]    Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Object, Error>}
   */
  @nobatch("This operation is not supported within a batch operation.")
  async fetchHTTPApiVersion(
    options: {
      retry?: number;
    } = {}
  ): Promise<string> {
    const { http_api_version } = await this.fetchServerInfo(options);
    return http_api_version;
  }

  /**
   * Process batch requests, chunking them according to the batch_max_requests
   * server setting when needed.
   *
   * @param  {Array}  requests     The list of batch subrequests to perform.
   * @param  {Object} [options={}] The options object.
   * @return {Promise<Object, Error>}
   */
  private async _batchRequests(
    requests: KintoRequest[],
    options: {
      retry?: number;
      headers?: Record<string, string>;
    } = {}
  ): Promise<OperationResponse[]> {
    const headers = this._getHeaders(options);
    if (!requests.length) {
      return [];
    }
    const serverSettings = await this.fetchServerSettings({
      retry: this._getRetry(options),
    });
    const maxRequests = serverSettings["batch_max_requests"];
    if (maxRequests && requests.length > maxRequests) {
      const chunks = partition(requests, maxRequests);
      const results = [];
      for (const chunk of chunks) {
        const result = await this._batchRequests(chunk, options);
        results.push(...result);
      }
      return results;
    }
    const { responses } = (await this.execute<BatchResponse>(
      {
        // FIXME: is this really necessary, since it's also present in
        // the "defaults"?
        headers,
        path: endpoints.batch(),
        method: "POST",
        body: {
          defaults: { headers },
          requests,
        },
      },
      { retry: this._getRetry(options) }
    )) as BatchResponse;
    return responses;
  }

  /**
   * Sends batch requests to the remote server.
   *
   * Note: Reserved for internal use only.
   *
   * @ignore
   * @param  {Function} fn                        The function to use for describing batch ops.
   * @param  {Object}   [options={}]              The options object.
   * @param  {Boolean}  [options.safe]            The safe option.
   * @param  {Number}   [options.retry]           The retry option.
   * @param  {String}   [options.bucket]          The bucket name option.
   * @param  {String}   [options.collection]      The collection name option.
   * @param  {Object}   [options.headers]         The headers object option.
   * @param  {Boolean}  [options.aggregate=false] Produces an aggregated result object.
   * @return {Promise<Object, Error>}
   */
  @nobatch("Can't use batch within a batch!")
  async batch(
    fn: BaseBatch | BucketBatch | CollectionBatch,
    options: {
      safe?: boolean;
      retry?: number;
      bucket?: string;
      collection?: string;
      headers?: Record<string, string>;
      aggregate?: boolean;
    } = {}
  ): Promise<OperationResponse<KintoObject>[] | AggregateResponse> {
    const rootBatch = new KintoClientBase(this.remote, {
      events: this.events,
      batch: true,
      safe: this._getSafe(options),
      retry: this._getRetry(options),
    });
    if (options.bucket && options.collection) {
      (fn as CollectionBatch)(
        rootBatch.bucket(options.bucket).collection(options.collection)
      );
    } else if (options.bucket) {
      (fn as BucketBatch)(rootBatch.bucket(options.bucket));
    } else {
      (fn as BaseBatch)(rootBatch);
    }
    const responses = await this._batchRequests(rootBatch._requests, options);
    if (options.aggregate) {
      return aggregate(responses, rootBatch._requests);
    } else {
      return responses;
    }
  }

  /**
   * Executes an atomic HTTP request.
   *
   * @param  {Object}  request             The request object.
   * @param  {String}  request.path        The path to fetch, relative
   *     to the Kinto server root.
   * @param  {String}  [request.method="GET"] The method to use in the
   *     request.
   * @param  {Body}    [request.body]      The request body.
   * @param  {Object}  [request.headers={}] The request headers.
   * @param  {Object}  [options={}]        The options object.
   * @param  {Boolean} [options.raw=false] If true, resolve with full response
   * @param  {Boolean} [options.stringify=true] If true, serialize body data to
   * @param  {Number}  [options.retry=0]   The number of times to
   *     retry a request if the server responds with Retry-After.
   * JSON.
   * @return {Promise<Object, Error>}
   */
  async execute<T>(
    request: KintoRequest,
    options: {
      raw?: boolean;
      stringify?: boolean;
      retry?: number;
      query?: { [key: string]: string };
      fields?: string[];
    } = {}
  ): Promise<T | HttpResponse<T>> {
    const { raw = false, stringify = true } = options;
    // If we're within a batch, add the request to the stack to send at once.
    if (this._isBatch) {
      this._requests.push(request);
      // Resolve with a message in case people attempt at consuming the result
      // from within a batch operation.
      const msg = ("This result is generated from within a batch " +
        "operation and should not be consumed.") as unknown as T;
      return raw
        ? ({ status: 0, json: msg, headers: new Headers() } as HttpResponse<T>)
        : msg;
    }
    const uri = this.remote + addEndpointOptions(request.path, options);
    const result = await this.http.request<T>(
      uri,
      cleanUndefinedProperties({
        // Limit requests to only those parts that would be allowed in
        // a batch request -- don't pass through other fancy fetch()
        // options like integrity, redirect, mode because they will
        // break on a batch request.  A batch request only allows
        // headers, method, path (above), and body.
        method: request.method,
        headers: request.headers,
        body: stringify ? JSON.stringify(request.body) : request.body,
      }),
      { retry: this._getRetry(options) }
    );
    return raw ? result : result.json;
  }

  /**
   * Perform an operation with a given HTTP method on some pages from
   * a paginated list, following the `next-page` header automatically
   * until we have processed the requested number of pages. Return a
   * response with a `.next()` method that can be called to perform
   * the requested HTTP method on more results.
   *
   * @private
   * @param  {String}  path
   *     The path to make the request to.
   * @param  {Object}  params
   *     The parameters to use when making the request.
   * @param  {String}  [params.sort="-last_modified"]
   *     The sorting order to use when doing operation on pages.
   * @param  {Object}  [params.filters={}]
   *     The filters to send in the request.
   * @param  {Number}  [params.limit=undefined]
   *     The limit to send in the request. Undefined means no limit.
   * @param  {Number}  [params.pages=undefined]
   *     The number of pages to operate on. Undefined means one page. Pass
   *     Infinity to operate on everything.
   * @param  {String}  [params.since=undefined]
   *     The ETag from which to start doing operation on pages.
   * @param  {Array}   [params.fields]
   *     Limit response to just some fields.
   * @param  {Object}  [options={}]
   *     Additional request-level parameters to use in all requests.
   * @param  {Object}  [options.headers={}]
   *     Headers to use during all requests.
   * @param  {Number}  [options.retry=0]
   *     Number of times to retry each request if the server responds
   *     with Retry-After.
   * @param  {String}  [options.method="GET"]
   *     The method to use in the request.
   */
  async paginatedOperation<T>(
    path: string,
    params: PaginatedParams = {},
    options: {
      headers?: Record<string, string>;
      retry?: number;
      method?: HttpMethod;
    } = {}
  ): Promise<PaginationResult<T>> {
    // FIXME: this is called even in batch requests, which doesn't
    // make any sense (since all batch requests get a "dummy"
    // response; see execute() above).
    const { sort, filters, limit, pages, since, fields } = {
      sort: "-last_modified",
      ...params,
    };
    // Safety/Consistency check on ETag value.
    if (since && typeof since !== "string") {
      throw new Error(
        `Invalid value for since (${since}), should be ETag value.`
      );
    }

    const query: { [key: string]: any } = {
      ...filters,
      _sort: sort,
      _limit: limit,
      _since: since,
    };
    if (fields) {
      query._fields = fields;
    }
    const querystring = qsify(query);
    let results: T[] = [],
      current = 0;

    const next = async function (
      nextPage: string | null
    ): Promise<PaginationResult<T>> {
      if (!nextPage) {
        throw new Error("Pagination exhausted.");
      }

      return processNextPage(nextPage);
    };

    const processNextPage = async (
      nextPage: string
    ): Promise<PaginationResult<T>> => {
      const { headers } = options;
      return handleResponse(await this.http.request(nextPage, { headers }));
    };

    const pageResults = (
      results: T[],
      nextPage: string | null,
      etag: string | null
    ): PaginationResult<T> => {
      // ETag string is supposed to be opaque and stored «as-is».
      // ETag header values are quoted (because of * and W/"foo").
      return {
        last_modified: etag ? etag.replace(/"/g, "") : etag,
        data: results,
        next: next.bind(null, nextPage),
        hasNextPage: !!nextPage,
        totalRecords: -1,
      };
    };

    const handleResponse = async function ({
      headers = new Headers(),
      json = {} as DataResponse<T[]>,
    }: HttpResponse<DataResponse<T[]>>): Promise<PaginationResult<T>> {
      const nextPage = headers.get("Next-Page");
      const etag = headers.get("ETag");

      if (!pages) {
        return pageResults(json.data, nextPage, etag);
      }
      // Aggregate new results with previous ones
      results = results.concat(json.data);
      current += 1;
      if (current >= pages || !nextPage) {
        // Pagination exhausted
        return pageResults(results, nextPage, etag);
      }
      // Follow next page
      return processNextPage(nextPage);
    };

    return handleResponse(
      (await this.execute(
        // N.B.: This doesn't use _getHeaders, because all calls to
        // `paginatedList` are assumed to come from calls that already
        // have headers merged at e.g. the bucket or collection level.
        {
          headers: options.headers ? options.headers : {},
          path: path + "?" + querystring,
          method: options.method,
        },
        // N.B. This doesn't use _getRetry, because all calls to
        // `paginatedList` are assumed to come from calls that already
        // used `_getRetry` at e.g. the bucket or collection level.
        { raw: true, retry: options.retry || 0 }
      )) as HttpResponse<DataResponse<T[]>>
    );
  }

  /**
   * Fetch some pages from a paginated list, following the `next-page`
   * header automatically until we have fetched the requested number
   * of pages. Return a response with a `.next()` method that can be
   * called to fetch more results.
   *
   * @private
   * @param  {String}  path
   *     The path to make the request to.
   * @param  {Object}  params
   *     The parameters to use when making the request.
   * @param  {String}  [params.sort="-last_modified"]
   *     The sorting order to use when fetching.
   * @param  {Object}  [params.filters={}]
   *     The filters to send in the request.
   * @param  {Number}  [params.limit=undefined]
   *     The limit to send in the request. Undefined means no limit.
   * @param  {Number}  [params.pages=undefined]
   *     The number of pages to fetch. Undefined means one page. Pass
   *     Infinity to fetch everything.
   * @param  {String}  [params.since=undefined]
   *     The ETag from which to start fetching.
   * @param  {Array}   [params.fields]
   *     Limit response to just some fields.
   * @param  {Object}  [options={}]
   *     Additional request-level parameters to use in all requests.
   * @param  {Object}  [options.headers={}]
   *     Headers to use during all requests.
   * @param  {Number}  [options.retry=0]
   *     Number of times to retry each request if the server responds
   *     with Retry-After.
   */
  async paginatedList<T>(
    path: string,
    params: PaginatedParams = {},
    options: { headers?: Record<string, string>; retry?: number } = {}
  ): Promise<PaginationResult<T>> {
    return this.paginatedOperation<T>(path, params, options);
  }

  /**
   * Delete multiple objects, following the pagination if the number of
   * objects exceeds the page limit until we have deleted the requested
   * number of pages. Return a response with a `.next()` method that can
   * be called to delete more results.
   *
   * @private
   * @param  {String}  path
   *     The path to make the request to.
   * @param  {Object}  params
   *     The parameters to use when making the request.
   * @param  {String}  [params.sort="-last_modified"]
   *     The sorting order to use when deleting.
   * @param  {Object}  [params.filters={}]
   *     The filters to send in the request.
   * @param  {Number}  [params.limit=undefined]
   *     The limit to send in the request. Undefined means no limit.
   * @param  {Number}  [params.pages=undefined]
   *     The number of pages to delete. Undefined means one page. Pass
   *     Infinity to delete everything.
   * @param  {String}  [params.since=undefined]
   *     The ETag from which to start deleting.
   * @param  {Array}   [params.fields]
   *     Limit response to just some fields.
   * @param  {Object}  [options={}]
   *     Additional request-level parameters to use in all requests.
   * @param  {Object}  [options.headers={}]
   *     Headers to use during all requests.
   * @param  {Number}  [options.retry=0]
   *     Number of times to retry each request if the server responds
   *     with Retry-After.
   */
  paginatedDelete<T>(
    path: string,
    params: PaginatedParams = {},
    options: {
      headers?: Record<string, string>;
      retry?: number;
      safe?: boolean;
      last_modified?: number;
    } = {}
  ): Promise<PaginationResult<T>> {
    const { headers, safe, last_modified } = options;
    const deleteRequest = requests.deleteRequest(path, {
      headers,
      safe: safe ? safe : false,
      last_modified,
    });
    return this.paginatedOperation<T>(path, params, {
      ...options,
      headers: deleteRequest.headers as Record<string, string>,
      method: "DELETE",
    });
  }

  /**
   * Lists all permissions.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers={}] Headers to use when making
   *     this request.
   * @param  {Number} [options.retry=0]    Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Object[], Error>}
   */
  @capable(["permissions_endpoint"])
  async listPermissions(
    options: PaginatedParams & {
      retry?: number;
      headers?: Record<string, string>;
    } = {}
  ): Promise<PaginationResult<PermissionData>> {
    const path = endpoints.permissions();
    // Ensure the default sort parameter is something that exists in permissions
    // entries, as `last_modified` doesn't; here, we pick "id".
    const paginationOptions = { sort: "id", ...options };
    return this.paginatedList<PermissionData>(path, paginationOptions, {
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
    });
  }

  /**
   * Retrieves the list of buckets.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers={}] Headers to use when making
   *     this request.
   * @param  {Number} [options.retry=0]    Number of retries to make
   *     when faced with transient errors.
   * @param  {Object} [options.filters={}] The filters object.
   * @param  {Array}  [options.fields]     Limit response to
   *     just some fields.
   * @return {Promise<Object[], Error>}
   */
  async listBuckets(
    options: PaginatedParams & {
      retry?: number;
      headers?: Record<string, string>;
      filters?: Record<string, string | number>;
      fields?: string[];
      since?: string;
    } = {}
  ): Promise<PaginationResult<KintoObject>> {
    const path = endpoints.bucket();
    return this.paginatedList<KintoObject>(path, options, {
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
    });
  }

  /**
   * Creates a new bucket on the server.
   *
   * @param  {String|null}  id                The bucket name (optional).
   * @param  {Object}       [options={}]      The options object.
   * @param  {Boolean}      [options.data]    The bucket data option.
   * @param  {Boolean}      [options.safe]    The safe option.
   * @param  {Object}       [options.headers] The headers object option.
   * @param  {Number}       [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Object, Error>}
   */
  async createBucket<T extends MappableObject>(
    id: string | null,
    options: {
      data?: T & { id?: string };
      permissions?: Partial<Record<Permission, string[]>>;
      safe?: boolean;
      headers?: Record<string, string>;
      retry?: number;
    } = {}
  ): Promise<KintoResponse<T>> {
    const { data, permissions } = options;
    const _data = { ...data, id: id ? id : undefined };
    const path = _data.id ? endpoints.bucket(_data.id) : endpoints.bucket();
    return this.execute<KintoResponse<T>>(
      requests.createRequest(
        path,
        { data: _data, permissions },
        {
          headers: this._getHeaders(options),
          safe: this._getSafe(options),
        }
      ),
      { retry: this._getRetry(options) }
    ) as Promise<KintoResponse<T>>;
  }

  /**
   * Deletes a bucket from the server.
   *
   * @ignore
   * @param  {Object|String} bucket                  The bucket to delete.
   * @param  {Object}        [options={}]            The options object.
   * @param  {Boolean}       [options.safe]          The safe option.
   * @param  {Object}        [options.headers]       The headers object option.
   * @param  {Number}        [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Number}        [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async deleteBucket(
    bucket: string | KintoIdObject,
    options: {
      safe?: boolean;
      headers?: Record<string, string>;
      retry?: number;
      last_modified?: number;
    } = {}
  ): Promise<KintoResponse<{ deleted: boolean }>> {
    const bucketObj = toDataBody(bucket);
    if (!bucketObj.id) {
      throw new Error("A bucket id is required.");
    }
    const path = endpoints.bucket(bucketObj.id);
    const { last_modified } = { ...bucketObj, ...options };
    return this.execute<KintoResponse<{ deleted: boolean }>>(
      requests.deleteRequest(path, {
        last_modified,
        headers: this._getHeaders(options),
        safe: this._getSafe(options),
      }),
      { retry: this._getRetry(options) }
    ) as Promise<KintoResponse<{ deleted: boolean }>>;
  }

  /**
   * Deletes buckets.
   *
   * @param  {Object} [options={}]             The options object.
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Object} [options.headers={}]     Headers to use when making
   *     this request.
   * @param  {Number} [options.retry=0]        Number of retries to make
   *     when faced with transient errors.
   * @param  {Object} [options.filters={}]     The filters object.
   * @param  {Array}  [options.fields]         Limit response to
   *     just some fields.
   * @param  {Number}  [options.last_modified] The last_modified option.
   * @return {Promise<Object[], Error>}
   */
  @support("1.4", "2.0")
  async deleteBuckets(
    options: PaginatedParams & {
      safe?: boolean;
      retry?: number;
      headers?: Record<string, string>;
      last_modified?: number;
    } = {}
  ): Promise<PaginationResult<KintoObject>> {
    const path = endpoints.bucket();
    return this.paginatedDelete<KintoObject>(path, options, {
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
      safe: options.safe,
      last_modified: options.last_modified,
    });
  }

  @capable(["accounts"])
  async createAccount(
    username: string,
    password: string
  ): Promise<KintoResponse<{ password: string }>> {
    return this.execute<KintoResponse<{ password: string }>>(
      requests.createRequest(
        `/accounts/${username}`,
        { data: { password } },
        { method: "PUT" }
      )
    ) as Promise<KintoResponse<{ password: string }>>;
  }
}
