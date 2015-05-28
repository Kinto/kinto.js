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

    if (!this._collections.hasOwnProperty(collName))
      this._collections[collName] = new Collection(collName, new Api());
    return this._collections[collName];
  }
}
