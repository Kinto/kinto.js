"use strict";

import ERROR_CODES from "./errors.js";

/**
 * Enhanced HTTP client for the Kinto protocol.
 */
export default class HTTP {
  /**
   * Default HTTP request headers applied to each outgoing request.
   *
   * @type {Object}
   */
  static get DEFAULT_REQUEST_HEADERS() {
    return {
      "Accept":       "application/json",
      "Content-Type": "application/json",
    };
  }

  /**
   * Default options.
   *
   * @type {Object}
   */
  static get defaultOptions() {
    return {timeout: 5000, requestMode: "cors"};
  }

  /**
   * Constructor.
   *
   * Options:
   * - {Number} timeout      The request timeout in ms (default: `5000`).
   * - {String} requestMode  The HTTP request mode (default: `"cors"`).
   *
   * @param {EventEmitter} events  The event handler.
   * @param {Object}       options The options object.
   */
  constructor(events, options={}) {
    // public properties
    /**
     * The event emitter instance.
     * @type {EventEmitter}
     */
    if (!events) {
      throw new Error("No events handler provided");
    }
    this.events = events;

    options = Object.assign({}, HTTP.defaultOptions, options);

    /**
     * The request mode.
     * @see  https://fetch.spec.whatwg.org/#requestmode
     * @type {String}
     */
    this.requestMode = options.requestMode;

    /**
     * The request timeout.
     * @type {Number}
     */
    this.timeout = options.timeout;
  }

  /**
   * Performs an HTTP request to the Kinto server.
   *
   * Options:
   * - `{Object} headers` The request headers object (default: {})
   *
   * Resolves with an objet containing the following HTTP response properties:
   * - `{Number}  status`  The HTTP status code.
   * - `{Object}  json`    The JSON response body.
   * - `{Headers} headers` The response headers object; see the ES6 fetch() spec.
   *
   * @param  {String} url     The URL.
   * @param  {Object} options The fetch() options object.
   * @return {Promise}
   */
  request(url, options={headers:{}}) {
    let response, status, statusText, headers, _timeoutId, hasTimedout;
    // Ensure default request headers are always set
    options.headers = Object.assign({}, HTTP.DEFAULT_REQUEST_HEADERS, options.headers);
    options.mode = this.requestMode;
    return new Promise((resolve, reject) => {
      _timeoutId = setTimeout(() => {
        hasTimedout = true;
        reject(new Error("Request timeout."));
      }, this.timeout);
      fetch(url, options) .then(res => {
        if (!hasTimedout) {
          clearTimeout(_timeoutId);
          resolve(res);
        }
      }).catch(err => {
        if (!hasTimedout) {
          clearTimeout(_timeoutId);
          reject(err);
        }
      });
    })
      .then(res => {
        response = res;
        headers = res.headers;
        status = res.status;
        statusText = res.statusText;
        this._checkForDeprecationHeader(headers);
        this._checkForBackoffHeader(status, headers);
        return res.text();
      })
      // Check if we have a body; if so parse it as JSON.
      .then(text => {
        if (text.length === 0) {
          return null;
        }
        // Note: we can't consume the response body twice.
        return JSON.parse(text);
      })
      .catch(err => {
        const error = new Error(`HTTP ${status || 0}; ${err}`);
        error.response = response;
        error.stack = err.stack;
        throw error;
      })
      .then(json => {
        if (json && status >= 400) {
          let message = `HTTP ${status}; `;
          if (json.errno && json.errno in ERROR_CODES) {
            message += ERROR_CODES[json.errno];
            if (json.message) {
              message += `: ${json.message}`;
            }
          } else {
            message += statusText || "";
          }
          const error = new Error(message.trim());
          error.response = response;
          error.data = json;
          throw error;
        }
        return {status, json, headers};
      });
  }

  _checkForDeprecationHeader(headers) {
    const alertHeader = headers.get("Alert");
    if (!alertHeader) {
      return;
    }
    let alert;
    try {
      alert = JSON.parse(alertHeader);
    } catch(err) {
      console.warn("Unable to parse Alert header message", alertHeader);
      return;
    }
    console.warn(alert.message, alert.url);
    this.events.emit("deprecated", alert);
  }

  _checkForBackoffHeader(status, headers) {
    let backoffMs;
    const backoffSeconds = parseInt(headers.get("Backoff"), 10);
    if (backoffSeconds > 0) {
      backoffMs = (new Date().getTime()) + (backoffSeconds * 1000);
    } else {
      backoffMs = 0;
    }
    this.events.emit("backoff", backoffMs);
  }
}
