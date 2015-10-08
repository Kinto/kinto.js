"use strict";

import { EventEmitter } from "events";

import "babel/polyfill";
import "isomorphic-fetch";

import BaseAdapter from "./adapters/base";
import LocalStorage from "./adapters/LocalStorage";
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
      BaseAdapter: BaseAdapter,
      LocalStorage: LocalStorage,
      IDB: IDB,
    };
  }

  constructor(options={}) {
    const defaults = {
      adapter: Kinto.adapters.IDB,
      events: new EventEmitter()
    };

    super(Object.assign({}, defaults, options));
  }
}
