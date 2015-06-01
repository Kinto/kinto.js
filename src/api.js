"use strict";

export default class Api {
  constructor(collBaseUrl, options={}) {
    this._collBaseUrl = collBaseUrl;
    this._options = options;
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
          headers: {},
        },
        requests: records.map(record => {
          return {
            path: `${this._collBaseUrl}/${record.id}`,
            body: record
          }
        })
      }
    });
  }
}
