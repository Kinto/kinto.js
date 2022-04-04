import BaseAdapter, { AbstractBaseAdapter, StorageProxy } from "./base";
import { RecordStatus } from "../types";
import { getDeepKey } from "../utils";

// The file contains a basic implementation of an in-memory store for Kinto.
// The primary purpose of this adapter is to explain the methods required on
// adapter implementations. This adapter is not suitable for production use,
// unless you specifically do not want any data persistence. Even in that case,
// you should almost definitely use something else since this adapter is
// optimized for legibility, not performance or stability. For instance, this
// adapter has no concurrency controls, so simultaneous asynchronous updates
// will result in the database being in an inconsistent state.
//
// USE AT YOUR OWN RISK!

// All storage adapters need to extend from BaseAdapter. In fact, you'll get an
// error at run-time if you forget to extend from BaseAdapter. If you're
// developing in TypeScript (recommended!), it's suggested that you write your
// class without the `extends BaseAdapter`, and just the
// `implements AbstractBaseAdapter`, just until you stub out all the methods
// you need. Alternatively, you can copy/paste the BaseAdapter implementation
// and adjust the methods there.
export default class Memory<
    B extends { id: string; last_modified?: number; _status?: RecordStatus }
  >
  extends BaseAdapter<B>
  implements AbstractBaseAdapter<B>
{
  // This object will store our records. Since we primarily retreive records by
  // ID, we'll use that as the key.
  private _records: { [key: string]: B };

  // Each adapter is responsible for persisting a lastModified, to keep track
  // of the last modification time. Thankfully, kinto.js updates this property
  // when necessary, so you don't need to worry about keeping it
  // updated yourself.
  private _lastModified: number | null;

  // Each adapter must support arbitrary metadata. This should be an object
  // with string keys and arbitrary values. It's be fine for those values to be
  // serialized to strings, so don't worry about trying to convert to/from
  // native values.
  private _metadata: {
    [key: string]: any;
  } | null;

  // Your constructor can be anything you want it to be. Use this to specify
  // options specific to your adapter. Since we don't need anything special, we
  // don't accept any parameters.
  //
  // You also need to be sure to call super() to call the
  // BaseAdapter constructor.
  constructor() {
    super();

    // These are just the intial values for the properties mentioned above.
    this._records = {};
    this._lastModified = null;
    this._metadata = null;
  }

  // Calling this method should delete any records stored in the adapter. You
  // don't need to clear the lastModified and metadata since kinto.js is going
  // to clear those manually.
  //
  // Even though this is a synchronous method, the interface requires that you
  // return a Promise. We're using async here to make the code cleaner.
  public async clear() {
    this._records = {};
  }

  // Calling this record with a string ID should return the record that the ID
  // correlates to. If no record with the given ID is found, throw an Error.
  public async get(id: string) {
    if (this._records.hasOwnProperty(id)) {
      return this._records[id];
    }

    throw new Error(`Record with id ${id} not found`);
  }

  // This method returns all the records in the store that match the given
  // filters, sorted by the given order.
  //
  // `filters` is an object containing keys that represent the desired keys to
  // filter on, and values representing the values to filter on. The keys can
  // be simple keys, like `"title"`, or dot-notation keys like `"author.name"`.
  // Dot-notation keys represent deep properties to filter. Values can be
  // either a single value, or an array of values. If the value is an Array,
  // a record that matches any element of the array is considered a match for
  // the filter.
  //
  // `order` is a string representing the key to sort by. By default, this
  // method should return results ordered by the `last_modified` property
  // in descending order. If the `order` property is prefixed with `-`, return
  // results in ascending order.
  //
  // Examples:
  //   Find all records with `title` equal to "The Lusty Argonian Maid"
  //   list({
  //     filters: { title: "The Lusty Argonian Maid" }
  //   });
  //
  //   Find all records with `author.name` equal to "Crassius Curio"
  //   list({
  //     filters: { "author.name": "Crassius Curio" }
  //   });
  //
  //   Sort all records by `publishDate`, descending.
  //   list({
  //     order: "publishDate"
  //   });
  //
  //   Sort all records by `publishDate`, ascending.
  //   list({
  //     order: "-publishDate"
  //   });
  public async list(params: {
    filters?: { [key: string]: any };
    order?: string;
  }) {
    return Object.values(this._records)
      .filter((record) => {
        // If no filters are provided, all records match.
        if (!params.filters) {
          return true;
        }

        let matches = true;
        Object.entries(params.filters).forEach(([key, value]) => {
          const recordValue = getDeepKey(record, key);
          if (Array.isArray(value)) {
            if (!value.includes(recordValue)) {
              matches = false;
            }
          } else if (recordValue !== value) {
            matches = false;
          }
        });
        return matches;
      })
      .sort((a, b) => {
        // By default, sory by last_modified in descending order.
        let descendingOrder = true;
        let key = "last_modified";

        if (params.order) {
          descendingOrder = params.order.startsWith("-");
          key = descendingOrder ? params.order.substring(1) : params.order;
        }

        if (a[key as keyof B] < b[key as keyof B]) {
          return descendingOrder ? 1 : -1;
        } else if (a[key as keyof B] > b[key as keyof B]) {
          return descendingOrder ? -1 : 1;
        }

        return 0;
      });
  }

  // This method represents the core storage of an adapter. `execute` is
  // responsible for performing all of the primary storage operations. These
  // operations are performed by way of a StorageProxy. You can read about the
  // implementation of a proxy towards the bottom of this class.
  //
  // This method takes in a callback which is passed the storage proxy. Since
  // all operations are intended to be performed in a transaction, you can also
  // preload records as they are at the beginning of the transaction by passing
  // the record IDs to `options.preload`.
  //
  // !!! WARNING !!!
  // Since this is an in-memory adapter, and not intended for production use,
  // this method doesn't contain any sort of concurrency control. This is
  // primarily handled at the storage layer, not the adapter level. If you're
  // implementing your own adapter, please research its atomic
  // transaction capabilities.
  public async execute<T>(
    callback: (proxy: StorageProxy<B>) => T,
    options: { preload: string[] } = { preload: [] }
  ) {
    // To support rollback, we take a copy of all the records in the store.
    const originalRecords = { ...this._records };
    // If an error occurs, we rollback the store to the original state.
    const rollback = () => {
      this._records = { ...originalRecords };
    };

    // `execute` needs to return the return value of the provided callback.
    let result: T;
    const runCallback = (preloaded: { [key: string]: B } = {}) => {
      // Create a storage proxy, passing in preloaded records.
      const proxy = this.proxy(preloaded);
      // Execute the callback, passing in the storage proxy.
      const returned = callback(proxy);
      // Set the return value to the value returned from the callback.
      result = returned;
    };

    // Since the callback can throw errors, we wrap this in a try/catch block.
    try {
      // If no records are preloaded, we can run the callback without passing
      // in anything.
      if (!options.preload) {
        runCallback();
      } else {
        // The user has requested that we preload records. Preloaded records
        // are in the shape of { id: record }.
        const preloadedRecords: { [key: string]: B } = options.preload
          .map((id) => {
            return this._records[id.toString()];
          })
          // If a record with the given ID is not found, undefined is returned,
          // so we use this filter to remove them.
          .filter(Boolean)
          .reduce<{ [key: string]: B }>((acc, record) => {
            acc[record.id] = record;
            return acc;
          }, {});

        // Run the callback, passing in the preloaded records.
        runCallback(preloadedRecords);
      }
    } catch (err) {
      // If an error occurs, we need to restore the original state of the store.
      rollback();

      // Once we restore the original state, we rethrow the error so that the
      // caller can handle it and respond appropriately.
      throw err;
    }

    // Once done, we return the return value of the callback.
    return result!;
  }

  // This method is deprecated, and will be removed in a future version. For
  // the time being, just call the new method.
  public async loadDump(
    records: (B & {
      last_modified: number;
    })[]
  ) {
    return this.importBulk(records);
  }

  // This method allows the caller to import an array of records into
  // the store.
  public async importBulk(records: B[]) {
    // Since we call this method as a transaction, it can throw an error that
    // we need to handle, so we wrap it in try/catch.
    try {
      // We use `execute` so that the entire operation is performed in a
      // single transaction.
      await this.execute((transaction) => {
        records.forEach((record) => {
          // Records should be updated, not created. `update` will create if
          // the record doesn't exist.
          transaction.update(record);
        });
      });
      // Once the records are imported, we compare the last_modified of the
      // store to the records.
      const previousLastModified = await this.getLastModified();
      const lastModified = Math.max(
        ...records.map((record) => record.last_modified!)
      );
      // If the records contain a higher `last_modified`, we set the store's
      // last_modified to match.
      if (previousLastModified && lastModified > previousLastModified) {
        await this.saveLastModified(lastModified);
      }
      return records;
    } catch (e) {
      throw new Error("error while importing");
    }

    return [];
  }

  // Set the lastModified of the store to the provided value.
  public async saveLastModified(lastModified: number | null) {
    this._lastModified = lastModified;
    return this._lastModified;
  }

  // Return the lastModified property of the store.
  public async getLastModified() {
    return this._lastModified;
  }

  // This method allows the caller to store arbitrary metadata about the
  // adapter. It accepts an object or null (in case you want to clear
  // the metadata).
  public async saveMetadata(
    metadata: {
      [key: string]: any;
    } | null
  ) {
    this._metadata = metadata;
    return this._metadata;
  }

  // Returns the stored metadata.
  public async getMetadata<T>() {
    return this._metadata as T;
  }

  // The `proxy` method isn't part of the BaseAdapter API, and can be
  // implemented however you wish (as long as it returns an object that
  // conforms to the StorageProxy interface that is). The returned proxy is
  // responsible for making modifications to the store as part of the
  // `execute` method.
  //
  // An important thing to consider is that all of the returned methods must
  // be synchronous methods. You cannot use Promises, `async`/`await`, or any
  // other forms of asynchronous methods.
  //
  // It accepts a map of ID -> record for the `get` method. This is to support
  // getting records as they were at the start of a transaction.
  private proxy(preloaded: { [key: string]: B } = {}): StorageProxy<B> {
    // `create` adds a record to the store, ensuring that another record with
    // the same `id` property doesn't already exist.
    const create = (record: B) => {
      if (this._records.hasOwnProperty(record.id)) {
        throw new Error(`record with id ${record.id} already exists`);
      }
      this._records[record.id] = record;
    };

    // `update` updates a record completely with the new value provided. It
    // will also create a record if it does not exist.
    const update = (record: B) => {
      this._records[record.id] = record;
      return record.id;
    };

    // `delete` removes the record with a given ID from the store.
    //
    // Note: this function is named _delete since `delete` is a reserved word.
    const _delete = (id: string) => {
      delete this._records[id];
    };

    // `get` returns the preloaded record with the given ID.
    //
    // Note: This method only returns records from the preloaded records. It
    // does not access the store.
    const get = (id: string) => {
      return preloaded[id];
    };

    // The StorageProxy interface has four methods: create, update, delete,
    // and get.
    return {
      create,
      update,
      delete: _delete,
      get,
    };
  }
}
