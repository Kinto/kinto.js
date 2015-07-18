"use strict";

import { getUnixTime } from "./utils";
import ERROR_CODES from "./errors.js";

export default class HTTP {
  static get DEFAULT_REQUEST_HEADERS() {
    return {
      "Accept":       "application/json",
      "Content-Type": "application/json",
    };
  }

  /**
   * Constructor.
   *
   * Options:
   * - {Number} backoffRelease Backoff release timestamp.
   *
   * @param  {Object} options [description]
   * @return {[type]}         [description]
   */
  constructor(options={backoffRelease: null}) {
    this._backoffRelease = options.backoffRelease;
  }

  /**
   * Backoff release timestamp, if any.
   *
   * @return {Number|null}
   */
  get backoffRelease() {
    return this._backoffRelease;
  }

  /**
   * Performs an HTTP request to the Kinto server. Resolves with an objet
   * containing the following properties:
   *
   * - {Number}  status  The HTTP status code.
   * - {Object}  json    The JSON response body.
   * - {Headers} headers The response headers object; see the ES6 fetch() spec.
   *
   * @param  {String} url     The URL.
   * @param  {Object} options The fetch() options object.
   * @return {Promise}
   */
  request(url, options={headers:{}}) {
    // Handle request backoff
    const currentTime = getUnixTime();
    if (this.backoffRelease && currentTime < this.backoffRelease) {
      return this.delayedRequest(this.backoffRelease - currentTime, url, options);
    }
    var response, status, statusText, headers;
    // Ensure default request headers are always set
    options.headers = Object.assign({}, HTTP.DEFAULT_REQUEST_HEADERS, options.headers);
    return fetch(url, options)
      .then(res => {
        response = res;
        headers = res.headers;
        status = res.status;
        statusText = res.statusText;
        this._checkForDeprecationHeader(headers);
        this._checkForBackoffHeader(headers);
        const contentLength = headers.get("Content-Length");
        if (!contentLength || contentLength == 0)
          return null;
        return res.json();
      })
      .catch(err => {
        const error = new Error(`HTTP ${status || 0}; ${err}`);
        error.response = response;
        error.stack = err.stack;
        throw error;
      })
      .then(json => {
        if (status >= 400) {
          var message = `HTTP ${status}; `;
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

  /**
   * Delays the execution of a request.
   *
   * @param  {Number} timeout The delay in seconds.
   * @param  {String} url     The URL.
   * @param  {Object} options The request otions object.
   * @return {Promise}
   */
  delayedRequest(timeout, url, options) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(this.request.call(this, url, options));
      }, timeout);
    });
  }

  _checkForDeprecationHeader(headers) {
    const alertHeader = headers.get("Alert");
    if (!alertHeader)
      return;
    try {
      const {message, url} = JSON.parse(alertHeader);
      console.warn(message, url);
    } catch(err) {
      console.warn("Unable to parse Alert header message", alertHeader);
    }
  }

  _checkForBackoffHeader(headers) {
    const backoffHeader = parseInt(headers.get("Backoff"), 10);
    this._backoffRelease = backoffHeader > 0 ? getUnixTime() + backoffHeader : null;
  }
}
