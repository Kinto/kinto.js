import Api from "kinto-http";
import BaseAdapter, { AbstractBaseAdapter } from "./adapters/base";
import IDB from "./adapters/IDB";
import KintoBase from "./KintoBase";
import { getDeepKey } from "./utils";

import type { KintoBaseOptions } from "./KintoBase";
import type { StorageProxy } from "./adapters/base";
import type Collection from "./collection";
import type { CollectionSyncOptions, Conflict, RecordStatus } from "./types";

export default class Kinto<
  B extends { id: string; last_modified?: number; _status?: RecordStatus } = any
> extends KintoBase<B> {
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

  constructor(options: KintoBaseOptions = {}) {
    const defaults = {
      adapter: (
        dbName: string,
        options?: { dbName?: string; migrateOldData?: boolean }
      ) => {
        return new Kinto.adapters.IDB<B>(dbName, options);
      },
    };

    super({ ...defaults, ...options });
  }
}

export type {
  StorageProxy,
  RecordStatus,
  KintoBaseOptions,
  Collection,
  CollectionSyncOptions,
  Conflict,
};
export { KintoBase, BaseAdapter, AbstractBaseAdapter, getDeepKey };
