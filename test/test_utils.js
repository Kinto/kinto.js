"use strict";

export function fakeServerResponse(status, json, headers={}) {
  return Promise.resolve({
    status: status,
    headers: {
      get(name) {
        if (!headers.hasOwnProperty("Content-Length") && name === "Content-Length") {
          return JSON.stringify(json).length;
        }
        return headers[name];
      }
    },
    text() {
      return JSON.stringify(json);
    }
  });
}

export function updateTitleWithDelay(record, str, delay) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(Object.assign({}, record, {title: record.title + str}));
    }, delay);
  });
}
