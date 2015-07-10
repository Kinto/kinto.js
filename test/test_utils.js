"use strict";

export function fakeServerResponse(status, json, headers={}) {
  return Promise.resolve({
    status: status,
    headers: {
      get(name) {
        return headers[name];
      }
    },
    json() {
      return json;
    }
  });
}
