"use strict";

import Collection from "./collection";

export default class Cliquetis {
  constructor(options = {}) {
    this._options = options;
    this._collections = {};
  }

  collection(collName) {
    return new Promise((resolve, reject) => {
      // if collection collName is missing, reject
      if (!collName)
        return reject(new Error("missing collection name"));
      resolve(new Collection(collName).init());
    });
  }
}
