import Api from "kinto-http";
import BaseAdapter from "./adapters/base";
import { EventEmitter } from "events";
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
      IDB: IDB,
    };
  }

  constructor(options={}) {
    const defaults = {
      adapter: Kinto.adapters.IDB,
      events: new EventEmitter(),
      ApiClass: Api,
    };

    super({...defaults, ...options});
  }
}
