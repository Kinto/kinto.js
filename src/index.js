"use strict";

import "babel/polyfill";
import "isomorphic-fetch";

import { EventEmitter } from "events";
import Api from "./api";
import Collection from "./collection";
import BaseAdapter from "./adapters/base";
import LocalStorage from "./adapters/LocalStorage";
import IDB from "./adapters/IDB";
import RemoteTransformer from "./transformers/remote";

const DEFAULT_BUCKET_NAME = "default";

/**
 * Kinto class.
 */
export default class Kinto {
  /**
   * Provides a public access to the base adapter classes. Users can create
   * a custom DB adapter by extending BaseAdapter.
   *
   * @return {Object}
   */
  static get adapters() {
    return {
      BaseAdapter: BaseAdapter,
      LocalStorage: LocalStorage,
      IDB: IDB,
    };
  }

  /**
   * Provides a public access to base transformer classes. Users can create
   * custom transformers by extending these.
   *
   * @return {Object}
   */
  static get transformers() {
    return {
      RemoteTransformer: RemoteTransformer
    };
  }

  /**
   * Creates a remote transformer constructor, the ES5 way.
   *
   * @return {RemoteTransformer}
   */
  static createRemoteTransformer(proto) {
    if (!proto || typeof proto !== "object")
      throw new Error("Expected prototype object.");

    class _RemoteTransformer extends RemoteTransformer {
      constructor() {
        super();
        // If a constructor is passed from the proto object, apply it.
        if (proto.constructor)
          proto.constructor.apply(this, arguments);
      }
    }
    _RemoteTransformer.prototype = Object.assign(_RemoteTransformer.prototype, proto);
    return _RemoteTransformer;
  }

  /**
   * Constructor.
   *
   * Options:
   * - {String}       bucket   The collection bucket name.
   * - {EventEmitter} events   Events handler.
   * - {BaseAdapter}  adapter  The base DB adapter class.
   * - {String}       requestMode The HTTP CORS mode to use.
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
      headers:     this._options.headers || {},
      events:      this.events,
      requestMode: this._options.requestMode,
    });

    if (!this._collections.hasOwnProperty(collName)) {
      this._collections[collName] = new Collection(bucket, collName, api, {
        events:  this.events,
        adapter: this._options.adapter || Kinto.adapters.IDB,
      });
    }

    return this._collections[collName];
  }
}
