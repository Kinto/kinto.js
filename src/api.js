"use strict";

const RECORD_FIELDS_TO_CLEAN = ["_status", "last_modified"];

export function cleanRecord(record, excludeFields=RECORD_FIELDS_TO_CLEAN) {
  return Object.keys(record).reduce((acc, key) => {
    if (excludeFields.indexOf(key) === -1)
      acc[key] = record[key];
    return acc;
  }, {});
};

const DEFAULT_REQUEST_HEADERS = {
  "Accept":       "application/json",
  "Content-Type": "application/json",
};

export default class Api {
  constructor(remote, options={}) {
    if (typeof(remote) !== "string" || !remote.length)
      throw new Error("Invalid remote URL: " + remote);
    this.remote = remote;
    try {
      this.version = "v" + remote.match(/\/v(\d+)\/?$/)[1];
    } catch (err) {
      throw new Error("The remote URL must contain the version: " + remote);
    }
  }

  endpoints(options={full: true}) {
    var root = options.full ? this.remote : `/${this.version}`;
    return {
      root:           () => root,
      batch:          () => `${root}/batch`,
      collection: (coll) => `${root}/collections/${coll}/records`,
      record: (coll, id) => `${this.endpoints(options).collection(coll)}/${id}`,
    };
  }

  /**
   * Fetches latest changes from the remote server.
   *
   * @param  {String} collName     The collection name.
   * @param  {Number} lastModified Latest sync timestamp.
   * @param  {Object} options      Options.
   * @return {Promise}
   */
  fetchChangesSince(collName, lastModified=null, options={headers: {}}) {
    var newLastModified;
    var queryString = "?" + (lastModified ? "_since=" + lastModified : "");
    return fetch(this.endpoints().collection(collName) + queryString, {
      headers: Object.assign({}, DEFAULT_REQUEST_HEADERS, {
        "If-Modified-Since": lastModified ? String(lastModified) : "0"
      }, options.headers)
    })
      .then(res => {
        // If HTTP 304, nothing has changed
        if (res.status === 304) {
          newLastModified = lastModified;
          return {items: []};
        } else if (res.status >= 400) {
          // TODO: attach better error reporting
          throw new Error("Fetching changes failed: HTTP " + res.status);
        } else {
          newLastModified = res.headers.get("Last-Modified");
          return res.json();
        }
      })
      .then(json => {
        return {
          lastModified: newLastModified,
          changes: json.items
        };
      });
  }

  /**
   * Sends batch update requests to the remote server.
   *
   * @param  {String} collName The collection name.
   * @param  {Array}  records  The list of record updates to send.
   * @param  {Object} headers  Headers to attach to each update request.
   * @param  {Object} options  Options.
   * @return {Promise}
   */
  batch(collName, records, headers={}, options={safe: true}) {
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
      headers: DEFAULT_REQUEST_HEADERS,
      body: JSON.stringify({
        defaults: { headers },
        requests: records.map(record => {
          const isDeletion = record._status === "deleted";
          const path = this.endpoints({full: false}).record(collName, record.id);
          const method = isDeletion ? "DELETE" : "PUT";
          const body = isDeletion ? undefined : cleanRecord(record);
          const headers = options.safe && record.last_modified ?
                          {"If-Unmodified-Since": String(record.last_modified)} : {};
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
          if (response.status && response.status >= 200 && response.status < 400) {
            results.published.push(response.body);
          } else if (response.status === 404) {
            results.skipped.push(response.body);
          } else if (response.status === 412) {
            results.conflicts.push({
              type: "outgoing",
              data: response.body
            });
          } else {
            results.errors.push({
              path: response.path, // this is the only way to have the id…
              error: response.body
            });
          }
        });
        return results;
      });
  }
}
