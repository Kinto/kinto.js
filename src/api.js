"use strict";

const RECORD_FIELDS_TO_CLEAN = ["_status", "last_modified"];

export function cleanRecord(record, exludeFields=RECORD_FIELDS_TO_CLEAN) {
  return Object.keys(record).reduce((acc, key) => {
    if (exludeFields.indexOf(key) === -1)
      acc[key] = record[key];
    return acc;
  }, {});
};

export default class Api {
  constructor(collBaseUrl, options={}) {
    this._collBaseUrl = collBaseUrl;
    this._options = options;
  }

  fetchChangesSince(timestamp=null) {
    return fetch(`${this._collBaseUrl}?_since=${timestamp||""}`, {
      headers: {"Accept": "application/json"}
    }).then(res => {
      return {
        lastModified: res.headers.get("Last-Modified"),
        changes: res.json()
      };
    });
  }

  batch(type, records) {
    var method;
    switch(type) {
      case "create": method = "POST";   break;
      case "update": method = "PATCH";  break;
      case "delete": method = "DELETE"; break;
    }
    return fetch(`${this._collBaseUrl}/batch`, {
      method: "POST",
      body: {
        defaults: {
          method:  method,
          headers: {}, // XXX pass default headers here
        },
        requests: records.map(record => {
          return {
            path: `${this._collBaseUrl}/${record.id}`,
            body: cleanRecord(record)
          }
        })
      }
    });
  }
}
