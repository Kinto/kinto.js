"use strict";

import { quote, unquote } from "./utils.js";

const RECORD_FIELDS_TO_CLEAN = ["_status", "last_modified"];

export function cleanRecord(record, excludeFields=RECORD_FIELDS_TO_CLEAN) {
  return Object.keys(record).reduce((acc, key) => {
    if (excludeFields.indexOf(key) === -1)
      acc[key] = record[key];
    return acc;
  }, {});
};

// TODO: This could probably be an attribute of the Api class, so that
// developers can get a hand on it to add their own headers.
const DEFAULT_REQUEST_HEADERS = {
  "Accept":       "application/json",
  "Content-Type": "application/json",
};

export default class Api {
  constructor(remote, options={headers: {}}) {
    if (typeof(remote) !== "string" || !remote.length)
      throw new Error("Invalid remote URL: " + remote);
    this.remote = remote;
    this.optionHeaders = options.headers;
    try {
      this.version = "v" + remote.match(/\/v(\d+)\/?$/)[1];
    } catch (err) {
      throw new Error("The remote URL must contain the version: " + remote);
    }
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
      root:                   () => root,
      batch:                  () => `${root}/batch`,
      bucket:           (bucket) => `${root}/buckets/${bucket}`,
      collection: (bucket, coll) => `${urls.bucket(bucket)}/collections/${coll}`,
      records:    (bucket, coll) => `${urls.collection(bucket, coll)}/records`,
      record: (bucket, coll, id) => `${urls.records(bucket, coll)}/${id}`,
    };
    return urls;
  }

  /**
   * Fetches latest changes from the remote server.
   *
   * @param  {String} bucketName   The bucket name.
   * @param  {String} collName     The collection name.
   * @param  {Object} options      Options.
   * @return {Promise}
   */
  fetchChangesSince(bucketName, collName, options={lastModified: null, headers: {}}) {
    const recordsUrl = this.endpoints().records(bucketName, collName);
    var newLastModified;
    var queryString = "";
    var headers = Object.assign({},
      DEFAULT_REQUEST_HEADERS,
      this.optionHeaders,
      options.headers
    );

    if (options.lastModified) {
      queryString = "?_since=" + options.lastModified;
      headers["If-None-Match"] = quote(options.lastModified);
    }

    return fetch(recordsUrl + queryString, {headers})
      .then(res => {
        // If HTTP 304, nothing has changed
        if (res.status === 304) {
          newLastModified = options.lastModified;
          return {data: []};
        } else if (res.status >= 400) {
          // TODO: attach better error reporting
          throw new Error("Fetching changes failed: HTTP " + res.status);
        } else {
          const etag = res.headers.get("ETag");  // e.g. '"42"'
          // XXX: ETag are supposed to be opaque and stored «as-is».
          newLastModified = parseInt(unquote(etag), 10);
          return res.json();
        }
      })
      .then(json => {
        return {
          lastModified: newLastModified,
          changes: json.data
        };
      });
  }

  /**
   * Sends batch update requests to the remote server.
   *
   * TODO: If more than X results (default is 25 on server), split in several
   * calls. Related: https://github.com/mozilla-services/cliquet/issues/318
   *
   * @param  {String} bucketName   The bucket name.
   * @param  {String} collName     The collection name.
   * @param  {Array}  records      The list of record updates to send.
   * @param  {Object} options      The options object.
   * @return {Promise}
   */
  batch(bucketName, collName, records, options={headers: {}}) {
    const safe = options.safe || true;
    const headers = Object.assign({},
      DEFAULT_REQUEST_HEADERS,
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
    return fetch(this.endpoints().batch(), {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        defaults: {headers},
        requests: records.map(record => {
          const isDeletion = record._status === "deleted";
          const path = this.endpoints({full: false}).record(bucketName, collName, record.id);
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
        })
      })
    })
      .then(res => res.json())
      .then(res => {
        if (res.error)
          throw Object.keys(res).reduce((err, key) => {
            if (key !== "message")
              err[key] = res[key];
            return err;
          }, new Error("BATCH request failed: " + res.message));
        res.responses.forEach(response => {
          // TODO: handle 409 when unicity rule is violated (ex. POST with
          // existing id, unique field, etc.)
          if (response.status && response.status >= 200 && response.status < 400) {
            results.published.push(response.body.data);
          } else if (response.status === 404) {
            results.skipped.push(response.body);
          } else if (response.status === 412) {
            results.conflicts.push({
              type: "outgoing",
              data: response.body
            });
          } else {
            results.errors.push({
              // TODO: since responses come in the same order, there should be a
              // way to get original record id
              path: response.path, // this is the only way to have the id…
              error: response.body
            });
          }
        });
        return results;
      });
  }
}
