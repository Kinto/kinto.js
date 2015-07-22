"use strict";

import "babel/polyfill";
import "isomorphic-fetch";

import Api from "./api";
import Collection from "./collection";
import { EventEmitter } from "events";

const DEFAULT_BUCKET_NAME = "default";

/**
 * Kinto class.
 */
export default class Kinto {
  constructor(options = {}) {
    this._options = options;
    this._collections = {};
    // public properties
    this.events = new EventEmitter();
  }

  collection(collName) {
    if (!collName)
      throw new Error("missing collection name");

    const bucket = this._options.bucket || DEFAULT_BUCKET_NAME;
    const api = new Api(this._options.remote || "http://localhost:8888/v1", this.events, {
      headers: this._options.headers || {}
    });

    if (!this._collections.hasOwnProperty(collName))
      this._collections[collName] = new Collection(bucket, collName, api, this.events);

    return this._collections[collName];
  }
}
