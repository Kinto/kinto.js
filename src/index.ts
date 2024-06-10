import KintoClient from "./http";
import BaseAdapter, { AbstractBaseAdapter } from "./adapters/base";
import IDB from "./adapters/IDB";
import KintoBase from "./KintoBase";
import { getDeepKey } from "./utils";

import type { KintoBaseOptions } from "./KintoBase";
import type { StorageProxy } from "./adapters/base";
import type Collection from "./collection";
import type { CollectionSyncOptions, Conflict, RecordStatus } from "./types";

// Coverage data structure to track which branches have been covered
let coverageData = {
  constructorDefaults: 0,
  constructorOptions: 0,
  adaptersAccessed: 0,
  apiClassAccessed: 0,
};

export default class Kinto<
  B extends {
    id: string;
    last_modified?: number;
    _status?: RecordStatus;
  } = any,
> extends KintoBase<B> {
  /**
   * Provides a public access to the base adapter classes. Users can create
   * a custom DB adapter by extending BaseAdapter.
   *
   * @type {Object}
   */
  static get adapters() {
    // This is a branch because it is a point where the program can either
    // access the adapters or not depending on whether this property is used.
    // Instrumentation to track branch coverage
    coverageData.adaptersAccessed += 1;
    return {
      BaseAdapter,
      IDB,
    };
  }

  get ApiClass() {
    // This is a branch because it is a point where the program can either
    // access the ApiClass or not depending on whether this getter is used.
    // Instrumentation to track branch coverage
    coverageData.apiClassAccessed += 1;
    return KintoClient;
  }

  constructor(options: KintoBaseOptions = {}) {
    // This is a branch because it checks if the `options` object is empty or not,
    // leading to two different execution paths.
    // Instrumentation to track branch coverage
    if (Object.keys(options).length === 0) {
      coverageData.constructorDefaults += 1;
    } else {
      coverageData.constructorOptions += 1;
    }

    // The defaults object is defined here, which is another point of execution flow.
    // This object will either be overridden by provided options or not.
    const defaults = {
      adapter: (
        dbName: string,
        options?: { dbName?: string; migrateOldData?: boolean }
      ) => {
        return new Kinto.adapters.IDB<B>(dbName, options);
      },
    };

    // This merges the defaults with any options provided, another branch in execution flow.
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
export { KintoClient, KintoBase, BaseAdapter, AbstractBaseAdapter, getDeepKey };

// At the end of the program or tests, print the coverage data to see which branches were covered.
console.log("Coverage Data:", coverageData);
