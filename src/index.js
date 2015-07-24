"use strict";

import "babel/polyfill";
import "isomorphic-fetch";

import { EventEmitter } from "events";
import Api from "./api";
import Collection from "./collection";
import BaseAdapter from "./adapters/base";
import LocalStorage from "./adapters/LocalStorage";
import IDB from "./adapters/IDB";

const DEFAULT_BUCKET_NAME = "default";

/**
 * Kinto class.
 */
export default class Kinto {
  /**
   * Provides a public access to the BaseAdapter class, so that users can create
   * their DB adapter.
   * @return {BaseAdapter}
   */
  static get adapters() {
    return {
      BaseAdapter: BaseAdapter,
      LocalStorage: LocalStorage,
      IDB: IDB,
    }
  }

  /**
   * Constructor.
   *
   * Options:
   * - {String}       bucket  The collection bucket name.
   * - {EventEmitter} events  Events handler.
   * - {BaseAdapter}  adapter The base DB adapter class.
   *
   * @param  {Object} options The options object.
   */
  constructor(options={}) {
    this._options = options;
    this._collections = {};
    // public properties
    this.events = options.events || new EventEmitter();
  }

  /**
   * Creates or retrieve a Collection instance.
   *
   * @param  {String} collName The collection name.
   * @return {Collection}
   */
  collection(collName) {
    if (!collName)
      throw new Error("missing collection name");

    const bucket = this._options.bucket || DEFAULT_BUCKET_NAME;
    const api = new Api(this._options.remote || "http://localhost:8888/v1", {
      headers: this._options.headers || {},
      events: this.events,
    });

    if (!this._collections.hasOwnProperty(collName)) {
      this._collections[collName] = new Collection(bucket, collName, api, {
        events: this.events,
        adapter: this._options.adapter || Kinto.adapters.IDB,
      });
    }

    return this._collections[collName];
  }
}
