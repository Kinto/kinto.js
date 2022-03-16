import { delay, obscureAuthorizationHeader } from "./utils";
import {
  NetworkTimeoutError,
  ServerResponse,
  UnparseableResponseError,
  ServerResponseObject,
} from "./errors";
import { Emitter, FetchFunction, FetchHeaders, FetchResponse } from "./types";

interface HttpOptions {
  timeout?: number | null;
  requestMode?: RequestMode;
  fetchFunc?: FetchFunction;
}

interface RequestOptions {
  retry: number;
}

export interface HttpResponse<T> {
  status: number;
  json: T;
  headers: FetchHeaders;
}

/**
 * Enhanced HTTP client for the Kinto protocol.
 * @private
 */
export default class HTTP {
  /**
   * Default HTTP request headers applied to each outgoing request.
   *
   * @type {Object}
   */
  static get DEFAULT_REQUEST_HEADERS(): Record<string, string> {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  /**
   * Default options.
   *
   * @type {Object}
   */
  static get defaultOptions(): HttpOptions {
    return { timeout: null, requestMode: "cors" };
  }

  public events?: Emitter;
  public requestMode: RequestMode;
  public timeout: number;
  public fetchFunc: FetchFunction;

  /**
   * Constructor.
   *
   * @param {EventEmitter} events                       The event handler.
   * @param {Object}       [options={}}                 The options object.
   * @param {Number}       [options.timeout=null]       The request timeout in ms, if any (default: `null`).
   * @param {String}       [options.requestMode="cors"] The HTTP request mode (default: `"cors"`).
   */
  constructor(events?: Emitter, options: HttpOptions = {}) {
    // public properties
    /**
     * The event emitter instance.
     * @type {EventEmitter}
     */
    this.events = events;

    /**
     * The request mode.
     * @see  https://fetch.spec.whatwg.org/#requestmode
     * @type {String}
     */
    this.requestMode = options.requestMode || HTTP.defaultOptions.requestMode!;

    /**
     * The request timeout.
     * @type {Number}
     */
    this.timeout = options.timeout || HTTP.defaultOptions.timeout!;

    /**
     * The fetch() function.
     * @type {Function}
     */
    this.fetchFunc = options.fetchFunc || globalThis.fetch.bind(globalThis);
  }

  /**
   * @private
   */
  timedFetch(url: string, options: RequestInit): Promise<FetchResponse> {
    let hasTimedout = false;
    return new Promise((resolve, reject) => {
      // Detect if a request has timed out.
      let _timeoutId: ReturnType<typeof setTimeout>;
      if (this.timeout) {
        _timeoutId = setTimeout(() => {
          hasTimedout = true;
          if (options && options.headers) {
            options = {
              ...options,
              headers: obscureAuthorizationHeader(options.headers),
            };
          }
          reject(new NetworkTimeoutError(url, options));
        }, this.timeout);
      }
      function proceedWithHandler(fn: (arg: any) => void): (arg: any) => void {
        return (arg: any) => {
          if (!hasTimedout) {
            if (_timeoutId) {
              clearTimeout(_timeoutId);
            }
            fn(arg);
          }
        };
      }
      this.fetchFunc(url, options)
        .then(proceedWithHandler(resolve))
        .catch(proceedWithHandler(reject));
    });
  }

  /**
   * @private
   */
  async processResponse<T>(response: FetchResponse): Promise<HttpResponse<T>> {
    const { status, headers } = response;
    const text = await response.text();
    // Check if we have a body; if so parse it as JSON.
    let json: unknown;
    if (text.length !== 0) {
      try {
        json = JSON.parse(text);
      } catch (err) {
        throw new UnparseableResponseError(response, text, err as Error);
      }
    }
    if (status >= 400) {
      throw new ServerResponse(response, json as ServerResponseObject);
    }
    return { status, json: json as T, headers };
  }

  /**
   * @private
   */
  async retry<T>(
    url: string,
    retryAfter: number,
    request: RequestInit,
    options: RequestOptions
  ): Promise<HttpResponse<T>> {
    await delay(retryAfter);
    return this.request<T>(url, request, {
      ...options,
      retry: options.retry - 1,
    });
  }

  /**
   * Performs an HTTP request to the Kinto server.
   *
   * Resolves with an objet containing the following HTTP response properties:
   * - `{Number}  status`  The HTTP status code.
   * - `{Object}  json`    The JSON response body.
   * - `{Headers} headers` The response headers object; see the ES6 fetch() spec.
   *
   * @param  {String} url               The URL.
   * @param  {Object} [request={}]      The request object, passed to
   *     fetch() as its options object.
   * @param  {Object} [request.headers] The request headers object (default: {})
   * @param  {Object} [options={}]      Options for making the
   *     request
   * @param  {Number} [options.retry]   Number of retries (default: 0)
   * @return {Promise}
   */
  async request<T>(
    url: string,
    request: RequestInit = { headers: {} },
    options: RequestOptions = { retry: 0 }
  ): Promise<HttpResponse<T>> {
    // Ensure default request headers are always set
    request.headers = { ...HTTP.DEFAULT_REQUEST_HEADERS, ...request.headers };
    // If a multipart body is provided, remove any custom Content-Type header as
    // the fetch() implementation will add the correct one for us.
    if (request.body && request.body instanceof FormData) {
      if (request.headers instanceof Headers) {
        request.headers.delete("Content-Type");
      } else if (!Array.isArray(request.headers)) {
        delete request.headers["Content-Type"];
      }
    }
    request.mode = this.requestMode;

    const response = await this.timedFetch(url, request);
    const { headers } = response;

    this._checkForDeprecationHeader(headers);
    this._checkForBackoffHeader(headers);

    // Check if the server summons the client to retry after a while.
    const retryAfter = this._checkForRetryAfterHeader(headers);
    // If number of allowed of retries is not exhausted, retry the same request.
    if (retryAfter && options.retry > 0) {
      return this.retry<T>(url, retryAfter, request, options);
    } else {
      return this.processResponse<T>(response);
    }
  }

  _checkForDeprecationHeader(headers: FetchHeaders): void {
    const alertHeader = headers.get("Alert");
    if (!alertHeader) {
      return;
    }
    let alert;
    try {
      alert = JSON.parse(alertHeader);
    } catch (err) {
      console.warn("Unable to parse Alert header message", alertHeader);
      return;
    }
    console.warn(alert.message, alert.url);
    if (this.events) {
      this.events.emit("deprecated", alert);
    }
  }

  _checkForBackoffHeader(headers: FetchHeaders): void {
    let backoffMs;
    const backoffHeader = headers.get("Backoff");
    const backoffSeconds = backoffHeader ? parseInt(backoffHeader, 10) : 0;
    if (backoffSeconds > 0) {
      backoffMs = new Date().getTime() + backoffSeconds * 1000;
    } else {
      backoffMs = 0;
    }
    if (this.events) {
      this.events.emit("backoff", backoffMs);
    }
  }

  _checkForRetryAfterHeader(headers: FetchHeaders): number | undefined {
    const retryAfter = headers.get("Retry-After");
    if (!retryAfter) {
      return;
    }
    const delay = parseInt(retryAfter, 10) * 1000;
    const tryAgainAfter = new Date().getTime() + delay;
    if (this.events) {
      this.events.emit("retry-after", tryAgainAfter);
    }
    return delay;
  }
}
