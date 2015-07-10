"use strict";

import { quote, unquote } from "./utils.js";
import ERROR_CODES from "./errors.js";

const RECORD_FIELDS_TO_CLEAN = ["_status", "last_modified"];
export const SUPPORTED_PROTOCOL_VERSION = "v1";
export const DEFAULT_REQUEST_HEADERS = {
  "Accept":       "application/json",
  "Content-Type": "application/json",
};

export function cleanRecord(record, excludeFields=RECORD_FIELDS_TO_CLEAN) {
  return Object.keys(record).reduce((acc, key) => {
    if (excludeFields.indexOf(key) === -1)
      acc[key] = record[key];
    return acc;
  }, {});
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
export function request(url, options={headers:{}}) {
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

export default class Api {
  constructor(remote, options={headers: {}}) {
    if (typeof(remote) !== "string" || !remote.length)
      throw new Error("Invalid remote URL: " + remote);
    this.remote = remote;
    this.optionHeaders = options.headers;
    this.serverSettings = null;
    try {
      this.version = remote.match(/\/(v\d+)\/?$/)[1];
    } catch (err) {
      throw new Error("The remote URL must contain the version: " + remote);
    }
    if (this.version !== SUPPORTED_PROTOCOL_VERSION)
      throw new Error(`Unsupported protocol version: ${this.version}`);
  }

  /**
   * Retrieves available server enpoints.
   *
   * Options:
   * - {Boolean} fullUrl: Retrieve a fully qualified URL (default: true).
   *
   * @param  {Object} options Options object.
   * @return {String}
   */
  endpoints(options={fullUrl: true}) {
    var root = options.fullUrl ? this.remote : `/${this.version}`;
    var urls = {
      root:                   () => `${root}/`,
      batch:                  () => `${root}/batch`,
      bucket:           (bucket) => `${root}/buckets/${bucket}`,
      collection: (bucket, coll) => `${urls.bucket(bucket)}/collections/${coll}`,
      records:    (bucket, coll) => `${urls.collection(bucket, coll)}/records`,
      record: (bucket, coll, id) => `${urls.records(bucket, coll)}/${id}`,
    };
    return urls;
  }

  /**
   * Retrieves Kinto server settings.
   *
   * @return {Promise}
   */
  fetchServerSettings() {
    if (this.serverSettings)
      return Promise.resolve(this.serverSettings);
    return request(this.endpoints().root())
      .then(res => {
        this.serverSettings = res.json.settings;
        return this.serverSettings;
      });
  }

  /**
   * Fetches latest changes from the remote server.
   *
   * @param  {String} bucketName  The bucket name.
   * @param  {String} collName    The collection name.
   * @param  {Object} options     The options object.
   * @return {Promise}
   */
  fetchChangesSince(bucketName, collName, options={lastModified: null, headers: {}}) {
    const recordsUrl = this.endpoints().records(bucketName, collName);
    var queryString = "";
    var headers = Object.assign({},
      this.optionHeaders,
      options.headers
    );

    if (options.lastModified) {
      queryString = "?_since=" + options.lastModified;
      headers["If-None-Match"] = quote(options.lastModified);
    }

    return this.fetchServerSettings()
      .then(_ => request(recordsUrl + queryString, {headers}))
      .then(res => {
        var results;
        // If HTTP 304, nothing has changed
        if (res.status === 304) {
          return {
            lastModified: options.lastModified,
            changes: []
          };
        }
        // XXX: ETag are supposed to be opaque and stored «as-is».
        const etag = res.headers.get("ETag");  // e.g. '"42"'
        return {
          lastModified: etag ? parseInt(unquote(etag), 10) : options.lastModified,
          changes: res.json.data
        };
      });
  }

  /**
   * Builds an individual record batch request body.
   *
   * @param  {Object}  record The record object.
   * @param  {String}  path   The record endpoint URL.
   * @param  {Boolean} safe   Safe update?
   * @return {Object}         The request body object.
   */
  _buildRecordBatchRequest(record, path, safe) {
    const isDeletion = record._status === "deleted";
    const method = isDeletion ? "DELETE" : "PUT";
    const body = isDeletion ? undefined : {data: cleanRecord(record)};
    const headers = {};
    if (safe) {
      if (record.last_modified) {
        // Safe replace.
        headers["If-Match"] = quote(record.last_modified);
      } else if (!isDeletion) {
        // Safe creation.
        headers["If-None-Match"] = "*";
      }
    }
    return {method, headers, path, body};
  }

  /**
   * Sends batch update requests to the remote server.
   *
   * TODO: If more than X results (default is 25 on server), split in several
   * calls. Related: https://github.com/mozilla-services/cliquet/issues/318
   *
   * @param  {String} bucketName  The bucket name.
   * @param  {String} collName    The collection name.
   * @param  {Array}  records     The list of record updates to send.
   * @param  {Object} options     The options object.
   * @return {Promise}
   */
  batch(bucketName, collName, records, options={headers: {}}) {
    var response;
    const safe = options.safe || true;
    const headers = Object.assign({},
      this.optionHeaders,
      options.headers
    );
    const results = {
      errors:    [],
      published: [],
      conflicts: [],
      skipped:   []
    };
    if (!records.length)
      return Promise.resolve(results);
    return this.fetchServerSettings()
      .then(serverSettings => {
        return request(this.endpoints().batch(), {
          method: "POST",
          headers: headers,
          body: JSON.stringify({
            defaults: {headers},
            requests: records.map(record => {
              const path = this.endpoints({full: false})
                .record(bucketName, collName, record.id);
              return this._buildRecordBatchRequest(record, path, safe);
            })
          })
        });
      })
      .then(({status, json, headers}) => {
        // Handle individual batch subrequests responses
        json.responses.forEach((response, index) => {
          // TODO: handle 409 when unicity rule is violated (ex. POST with
          // existing id, unique field, etc.)
          if (response.status && response.status >= 200 && response.status < 400) {
            results.published.push(response.body.data);
          } else if (response.status === 404) {
            results.skipped.push(response.body);
          } else if (response.status === 412) {
            results.conflicts.push({
              type: "outgoing",
              local: records[index],
              // TODO: Once we get record information in this response object,
              // add it; for now, that's the error json body only.
              // Ref https://github.com/mozilla-services/kinto/issues/122
              remote: response.body
            });
          } else {
            results.errors.push({
              path: response.path,
              sent: records[index],
              error: response.body
            });
          }
        });
        return results;
      });
  }
}
