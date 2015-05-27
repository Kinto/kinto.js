"use strict";

import Collection from "./collection";

export default class Cliquetis {
  constructor(options = {}) {
    this._options = options;
    this._collections = {};
  }

  collection(collName) {
    if (!collName)
      return Promise.reject(new Error("missing collection name"));
    return new Promise((resolve, reject) => {
      // if collection collName is missing, reject
      resolve(new Collection(collName).init());
    });
  }
}
