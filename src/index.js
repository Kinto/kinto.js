"use strict";

import "babel/polyfill";
import "isomorphic-fetch";

import Api from "./api";
import Collection from "./collection";

export default class Cliquetis {
  constructor(options = {}) {
    this._options = options;
    this._collections = {};
  }

  collection(collName) {
    if (!collName)
      throw new Error("missing collection name");

    const api = new Api(this._options.remote || "http://0.0.0.0:8888/v0");

    if (!this._collections.hasOwnProperty(collName))
      this._collections[collName] = new Collection(collName, api);

    return this._collections[collName];
  }
}
