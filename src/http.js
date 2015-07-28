"use strict";

import { EventEmitter } from "events";
import ERROR_CODES from "./errors.js";

/**
 * HTTP class.
 */
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
   * - {EventEmitter} events       Events handler.
   * - {String}       requestMode  The HTTP request mode (default: "cors").
   *
   * @param  {Object} options The options object.
   */
  constructor(options={requestMode: "cors"}) {
    // public properties
    this.events = options.events || new EventEmitter();
    this.requestMode = options.requestMode;
  }

  /**
   * Performs an HTTP request to the Kinto server.
   *
   * Options:
   * - {Object} headers The request headers object (default: {})
   *
   * Resolves with an objet containing the following HTTP response properties:
   * - {Number}  status  The HTTP status code.
   * - {Object}  json    The JSON response body.
   * - {Headers} headers The response headers object; see the ES6 fetch() spec.
   *
   * @param  {String} url     The URL.
   * @param  {Object} options The fetch() options object.
   * @return {Promise}
   */
  request(url, options={headers:{}}) {
    var response, status, statusText, headers;
    // Ensure default request headers are always set
    options.headers = Object.assign({}, HTTP.DEFAULT_REQUEST_HEADERS, options.headers);
    options.mode = this.requestMode;
    return fetch(url, options)
      .then(res => {
        response = res;
        headers = res.headers;
        status = res.status;
        statusText = res.statusText;
        this._checkForDeprecationHeader(headers);
        this._checkForBackoffHeader(status, headers);
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

  _checkForDeprecationHeader(headers) {
    const alertHeader = headers.get("Alert");
    if (!alertHeader)
      return;
    var alert;
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
    // XXX Temporary fix
    // see https://github.com/mozilla-services/kinto/issues/148
    if (status === 304)
      return;
    var backoffMs;
    const backoffSeconds = parseInt(headers.get("Backoff"), 10);
    if (backoffSeconds > 0) {
      backoffMs = (new Date().getTime()) + (backoffSeconds * 1000);
    } else {
      backoffMs = 0;
    }
    this.events.emit("backoff", backoffMs);
  }
}
