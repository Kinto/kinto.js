"use strict";

import ERROR_CODES from "./errors.js";

export const DEFAULT_REQUEST_HEADERS = {
  "Accept":       "application/json",
  "Content-Type": "application/json",
};

/**
 * Performs an HTTP request to the Kinto server. Resolves with an objet
 * containing the following properties:
 *
 * - {Number}  status  The HTTP status code.
 * - {Object}  json    The JSON response body.
 * - {Headers} headers The response headers object (see ES6 fetch() spec).
 *
 * @param  {String} url
 * @param  {Object} options
 * @return {Promise}
 */
export default function request(url, options={headers:{}}) {
  var response, status, statusText, headers;
  // Ensure default request headers are always set
  options.headers = Object.assign({}, DEFAULT_REQUEST_HEADERS, options.headers);
  return fetch(url, options)
    .then(res => {
      response = res;
      headers = res.headers;
      status = res.status;
      statusText = res.statusText;
      if (headers.get("Content-Length") == 0) // 0 or "0"
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
