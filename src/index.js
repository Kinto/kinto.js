"use strict";

import { EventEmitter } from "events";
import Api from "kinto-http";
import BaseAdapter from "./adapters/base";
import IDB from "./adapters/IDB";
import KintoBase from "./KintoBase";

export default class Kinto extends KintoBase {
  /**
   * Provides a public access to the base adapter classes. Users can create
   * a custom DB adapter by extending BaseAdapter.
   *
   * @type {Object}
   */
  static get adapters() {
    return {
      BaseAdapter,
      IDB,
    };
  }

  get ApiClass() {
    return Api;
  }

  constructor(options = {}) {
    const defaults = {
      adapter: Kinto.adapters.IDB,
      events: new EventEmitter(),
    };

    super({ ...defaults, ...options });
  }
}
