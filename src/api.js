"use strict";

import { parse as urlParse, format as urlFormat } from "url";

import { quote, unquote, partition } from "./utils.js";
import HTTP from "./http.js";

const RECORD_FIELDS_TO_CLEAN = ["_status", "last_modified"];
/**
 * Currently supported protocol version.
 * @type {String}
 */
export const SUPPORTED_PROTOCOL_VERSION = "v1";

/**
 * Cleans a record object, excluding passed keys.
 *
 * @param  {Object} record        The record object.
 * @param  {Array}  excludeFields The list of keys to exclude.
 * @return {Object}               A clean copy of source record object.
 */
export function cleanRecord(record, excludeFields=RECORD_FIELDS_TO_CLEAN) {
  return Object.keys(record).reduce((acc, key) => {
    if (excludeFields.indexOf(key) === -1) {
      acc[key] = record[key];
    }
    return acc;
  }, {});
}

/**
 * High level HTTP client for the Kinto API.
 */
export default class Api {
  /**
   * Constructor.
   *
   * Options:
   * - {Object}       headers The key-value headers to pass to each request.
   * - {String}       events  The HTTP request mode.
   *
   * @param  {String}       remote  The remote URL.
   * @param  {EventEmitter} events  The events handler
   * @param  {Object}       options The options object.
   */
  constructor(remote, events, options={}) {
    if (typeof(remote) !== "string" || !remote.length) {
      throw new Error("Invalid remote URL: " + remote);
    }
    if (remote[remote.length-1] === "/") {
      remote = remote.slice(0, -1);
    }
    this._backoffReleaseTime = null;
    // public properties
    /**
     * The remote endpoint base URL.
     * @type {String}
     */
    this.remote = remote;
    /**
     * The optional generic headers.
     * @type {Object}
     */
    this.optionHeaders = options.headers || {};
    /**
     * Current server settings, retrieved from the server.
     * @type {Object}
     */
    this.serverSettings = null;
    /**
     * The even emitter instance.
     * @type {EventEmitter}
     */
    if (!events) {
      throw new Error("No events handler provided");
    }
    this.events = events;
    try {
      /**
       * The current server protocol version, eg. `v1`.
       * @type {String}
       */
      this.version = remote.match(/\/(v\d+)\/?$/)[1];
    } catch (err) {
      throw new Error("The remote URL must contain the version: " + remote);
    }
    if (this.version !== SUPPORTED_PROTOCOL_VERSION) {
      throw new Error(`Unsupported protocol version: ${this.version}`);
    }
    /**
     * The HTTP instance.
     * @type {HTTP}
     */
    this.http = new HTTP(this.events, {requestMode: options.requestMode});
    this._registerHTTPEvents();
  }

  /**
   * Backoff remaining time, in milliseconds. Defaults to zero if no backoff is
   * ongoing.
   *
   * @return {Number}
   */
  get backoff() {
    const currentTime = new Date().getTime();
    if (this._backoffReleaseTime && currentTime < this._backoffReleaseTime) {
      return this._backoffReleaseTime - currentTime;
    }
    return 0;
  }

  /**
   * Registers HTTP events.
   */
  _registerHTTPEvents() {
    this.events.on("backoff", backoffMs => {
      this._backoffReleaseTime = backoffMs;
    });
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
    const root = options.fullUrl ? this.remote : `/${this.version}`;
    const urls = {
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
    if (this.serverSettings) {
      return Promise.resolve(this.serverSettings);
    }
    return this.http.request(this.endpoints().root())
      .then(res => {
        this.serverSettings = res.json.settings;
        return this.serverSettings;
      });
  }

  _fetchChangesPage(page, results, url, headers, options) {
    if (options.maxPages && page > options.maxPages) {
      return Promise.resolve(results);
    }
    return this.http.request(url, {headers})
      .then(res => {
        // HTTP 304: nothing has changed
        // HTTP 412: collection changed since we started paginating
        if ([304, 412].indexOf(res.status) !== -1) {
          return {... results, ...{nextPage: null}};
        }

        // Extract pagination token, if any
        const nextPage = res.headers.get("Next-Page") || null;

        // XXX: ETag are supposed to be opaque and stored «as-is».
        // Extract response data
        let etag = res.headers.get("ETag");  // e.g. '"42"'
        etag = etag ? parseInt(unquote(etag), 10) : options.lastModified;
        const records = res.json.data;

        // Check if server was flushed
        const localSynced = options.lastModified;
        const serverChanged = etag > options.lastModified;
        const emptyCollection = records ? records.length === 0 : true;
        if (localSynced && serverChanged && emptyCollection) {
          throw Error("Server has been flushed.");
        }

        // Aggregate new results
        const newResults = {...results, ...{
          lastModified: etag,
          nextPage,
          changes: results.changes.concat(records),
        }};

        if (!nextPage) {
          return newResults;
        }

        return this._fetchChangesPage(
          page + 1,
          newResults,
          nextPage,
          headers,
          options
        );
      });
  }

  /**
   * Fetches latest changes from the remote server.
   *
   * Options:
   * - {Number|null} lastModified: The collection last modified timestamp.
   * - {Object}      headers:      The HTTP request headers.
   * - {Number|null} limit:        The number of changes per page to retrieve.
   * - {Number|null} maxPages:     The max number of result pages to retrieve.
   *
   * @param  {String} bucketName  The bucket name.
   * @param  {String} collName    The collection name.
   * @param  {Object} options     The options object.
   * @return {Promise}
   */
  fetchChangesSince(bucketName, collName, options={
    lastModified: null,
    headers: {},
    limit: null
  }) {
    const headers = Object.assign({}, this.optionHeaders, options.headers);
    const urlObj = urlParse(this.endpoints().records(bucketName, collName));
    const query = {};

    if (options.lastModified) {
      query._since = options.lastModified;
      headers["If-None-Match"] = quote(options.lastModified);
    }

    if (options.limit) {
      query._limit = options.limit;
    }

    const recordsUrl = urlFormat({...urlObj, ...{query}});

    const results = {
      lastModified: options.lastModified,
      nextPage: null,
      changes: [],
    };

    return this.fetchServerSettings()
      .then(_ => this._fetchChangesPage(
        1,
        results,
        recordsUrl,
        headers,
        options
      ));
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
   * Process a batch request response.
   *
   * @param  {Object}  results          The results object.
   * @param  {Array}   records          The initial records list.
   * @param  {Object}  response         The response HTTP object.
   * @return {Promise}
   */
  _processBatchResponses(results, records, response) {
    // Handle individual batch subrequests responses
    response.json.responses.forEach((response, index) => {
      // TODO: handle 409 when unicity rule is violated (ex. POST with
      // existing id, unique field, etc.)
      if (response.status && response.status >= 200 && response.status < 400) {
        results.published.push(response.body.data);
      } else if (response.status === 404) {
        results.skipped.push(records[index]);
      } else if (response.status === 412) {
        results.conflicts.push({
          type: "outgoing",
          local: records[index],
          remote: response.body.details && response.body.details.existing || null
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
  }

  /**
   * Sends batch update requests to the remote server.
   *
   * Options:
   * - {Object}  headers  Headers to attach to main and all subrequests.
   * - {Boolean} safe     Safe update (default: `true`)
   *
   * @param  {String} bucketName  The bucket name.
   * @param  {String} collName    The collection name.
   * @param  {Array}  records     The list of record updates to send.
   * @param  {Object} options     The options object.
   * @return {Promise}
   */
  batch(bucketName, collName, records, options={headers: {}}) {
    const safe = options.safe || true;
    const headers = Object.assign({}, this.optionHeaders, options.headers);
    const results = {
      errors:    [],
      published: [],
      conflicts: [],
      skipped:   []
    };
    if (!records.length) {
      return Promise.resolve(results);
    }
    return this.fetchServerSettings()
      .then(serverSettings => {
        // Kinto 1.6.1 possibly exposes multiple setting prefixes
        const maxRequests = serverSettings["batch_max_requests"] ||
                            serverSettings["cliquet.batch_max_requests"];
        if (maxRequests && records.length > maxRequests) {
          return Promise.all(partition(records, maxRequests).map(chunk => {
            return this.batch(bucketName, collName, chunk, options);
          }))
            .then(batchResults => {
              // Assemble responses of chunked batch results into one single
              // result object
              return batchResults.reduce((acc, batchResult) => {
                Object.keys(batchResult).forEach(key => {
                  acc[key] = results[key].concat(batchResult[key]);
                });
                return acc;
              }, results);
            });
        }
        return this.http.request(this.endpoints().batch(), {
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
        })
          .then(res => this._processBatchResponses(results, records, res));
      });
  }
}
