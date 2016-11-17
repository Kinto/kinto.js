/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import BaseAdapter from "../built/adapters/base";
import { filterObjects, sortObjects } from "../built/utils";

Components.utils.import("resource://gre/modules/Sqlite.jsm");
Components.utils.import("resource://gre/modules/Task.jsm");

const SQLITE_PATH = "kinto.sqlite";

const statements = {
  "createCollectionData": `
    CREATE TABLE collection_data (
      collection_name TEXT,
      record_id TEXT,
      record TEXT
    );`,

  "createCollectionMetadata": `
    CREATE TABLE collection_metadata (
      collection_name TEXT PRIMARY KEY,
      last_modified INTEGER
    ) WITHOUT ROWID;`,

  "createCollectionDataRecordIdIndex": `
    CREATE UNIQUE INDEX unique_collection_record
      ON collection_data(collection_name, record_id);`,

  "clearData": `
    DELETE FROM collection_data
      WHERE collection_name = :collection_name;`,

  "createData": `
    INSERT INTO collection_data (collection_name, record_id, record)
      VALUES (:collection_name, :record_id, :record);`,

  "updateData": `
    INSERT OR REPLACE INTO collection_data (collection_name, record_id, record)
      VALUES (:collection_name, :record_id, :record);`,

  "deleteData": `
    DELETE FROM collection_data
      WHERE collection_name = :collection_name
      AND record_id = :record_id;`,

  "saveLastModified": `
    REPLACE INTO collection_metadata (collection_name, last_modified)
      VALUES (:collection_name, :last_modified);`,

  "getLastModified": `
    SELECT last_modified
      FROM collection_metadata
        WHERE collection_name = :collection_name;`,

  "getRecord": `
    SELECT record
      FROM collection_data
        WHERE collection_name = :collection_name
        AND record_id = :record_id;`,

  "listRecords": `
    SELECT record
      FROM collection_data
        WHERE collection_name = :collection_name;`,

  // N.B. we have to have a dynamic number of placeholders, which you
  // can't do without building your own statement. See `execute` for details
  "listRecordsById": `
    SELECT record_id, record
      FROM collection_data
        WHERE collection_name = ?
          AND record_id IN `,

  "importData": `
    REPLACE INTO collection_data (collection_name, record_id, record)
      VALUES (:collection_name, :record_id, :record);`,

  "scanAllRecords": `SELECT * FROM collection_data;`,

  "clearCollectionMetadata": `DELETE FROM collection_metadata;`,
};

const createStatements = ["createCollectionData",
                          "createCollectionMetadata",
                          "createCollectionDataRecordIdIndex"];

const currentSchemaVersion = 1;

/**
 * Firefox adapter.
 *
 * Uses Sqlite as a backing store.
 *
 * Options:
 *  - path: the filename/path for the Sqlite database. If absent, use SQLITE_PATH.
 */
export default class FirefoxAdapter extends BaseAdapter {
  constructor(collection, options={}) {
    super();
    const {sqliteHandle=null} = options;
    this.collection = collection;
    this._connection = sqliteHandle;
    this._options = options;
  }

  // We need to be capable of calling this from "outside" the adapter
  // so that someone can initialize a connection and pass it to us in
  // adapterOptions.
  static _init(connection) {
    return Task.spawn(function* () {
      yield connection.executeTransaction(function* doSetup() {
        const schema = yield connection.getSchemaVersion();

        if (schema == 0) {

          for (let statementName of createStatements) {
            yield connection.execute(statements[statementName]);
          }

          yield connection.setSchemaVersion(currentSchemaVersion);
        } else if (schema != 1) {
          throw new Error("Unknown database schema: " + schema);
        }
      });
      return connection;
    });
  }

  _executeStatement(statement, params){
    if (!this._connection) {
      throw new Error("The storage adapter is not open");
    }
    return this._connection.executeCached(statement, params);
  }


  open() {
    const self = this;
    return Task.spawn(function* (){
      if (!self._connection) {
        const path = self._options.path || SQLITE_PATH;
        const opts = { path, sharedMemoryCache: false };
        self._connection = yield Sqlite.openConnection(opts).then(FirefoxAdapter._init);
      }
    });
  }

  close() {
    if (this._connection) {
      const promise = this._connection.close();
      this._connection = null;
      return promise;
    }
    return Promise.resolve();
  }

  clear() {
    const params = {collection_name: this.collection};
    return this._executeStatement(statements.clearData, params);
  }

  execute(callback, options={preload: []}) {
    if (!this._connection) {
      throw new Error("The storage adapter is not open");
    }

    let result;
    const conn = this._connection;
    const collection = this.collection;

    return conn.executeTransaction(function* doExecuteTransaction() {
      // Preload specified records from DB, within transaction.
      const parameters = [
        collection,
        ...options.preload
      ];
      const placeholders = options.preload.map(_ => "?");
      const stmt = statements.listRecordsById + "(" + placeholders.join(",") + ");";
      const rows = yield conn.execute(stmt,
                                      parameters);

      const preloaded = rows.reduce((acc, row) => {
        const record = JSON.parse(row.getResultByName("record"));
        acc[row.getResultByName("record_id")] = record;
        return acc;
      }, {});

      const proxy = transactionProxy(collection, preloaded);
      result = callback(proxy);

      for (let {statement, params} of proxy.operations) {
        yield conn.executeCached(statement, params);
      }
    }, conn.TRANSACTION_EXCLUSIVE)
    .then(_ => result);
  }

  get(id) {
    const params = {
      collection_name: this.collection,
      record_id: id,
    };
    return this._executeStatement(statements.getRecord, params)
      .then(result => {
        if (result.length == 0) {
          return;
        }
        return JSON.parse(result[0].getResultByName("record"));
      });
  }

  list(params={filters: {}, order: ""}) {
    const parameters = {
      collection_name: this.collection,
    };
    return this._executeStatement(statements.listRecords, parameters)
      .then(result => {
        const records = [];
        for (let k = 0; k < result.length; k++) {
          const row = result[k];
          records.push(JSON.parse(row.getResultByName("record")));
        }
        return records;
      })
      .then(results => {
        // The resulting list of records is filtered and sorted.
        // XXX: with some efforts, this could be implemented using SQL.
        return reduceRecords(params.filters, params.order, results);
      });
  }

  /**
   * Load a list of records into the local database.
   *
   * Note: The adapter is not in charge of filtering the already imported
   * records. This is done in `Collection#loadDump()`, as a common behaviour
   * between every adapters.
   *
   * @param  {Array} records.
   * @return {Array} imported records.
   */
  loadDump(records) {
    const connection = this._connection;
    const collection_name = this.collection;
    return Task.spawn(function* () {
      yield connection.executeTransaction(function* doImport() {
        for (let record of records) {
          const params = {
            collection_name: collection_name,
            record_id: record.id,
            record: JSON.stringify(record)
          };
          yield connection.execute(statements.importData, params);
        }
        const lastModified = Math.max(...records.map(record => record.last_modified));
        const params = {
          collection_name: collection_name
        };
        const previousLastModified = yield connection.execute(
          statements.getLastModified, params).then(result => {
            return result.length > 0 ?
              result[0].getResultByName("last_modified") : -1;
          });
        if (lastModified > previousLastModified) {
          const params = {
            collection_name: collection_name,
            last_modified: lastModified
          };
          yield connection.execute(statements.saveLastModified, params);
        }
      });
      return records;
    });
  }

  saveLastModified(lastModified) {
    const parsedLastModified = parseInt(lastModified, 10) || null;
    const params = {
      collection_name: this.collection,
      last_modified: parsedLastModified,
    };
    return this._executeStatement(statements.saveLastModified, params)
           .then(() => parsedLastModified);
  }

  getLastModified() {
    const params = {
      collection_name: this.collection,
    };
    return this._executeStatement(statements.getLastModified, params)
      .then(result => {
        if (result.length == 0) {
          return 0;
        }
        return result[0].getResultByName("last_modified");
      });
  }

  /**
   * Reset the sync status of every record and collection we have
   * access to.
   */
  resetSyncStatus() {
    // We're going to use execute instead of executeCached, so build
    // in our own sanity check
    if (!this._connection) {
      throw new Error("The storage adapter is not open");
    }

    return this._connection.executeTransaction(function* (conn) {
      const promises = [];
      yield conn.execute(statements.scanAllRecords, null, function(row) {
        const record = JSON.parse(row.getResultByName("record"));
        const record_id = row.getResultByName("record_id");
        const collection_name = row.getResultByName("collection_name");
        if (record._status === "deleted") {
          // Garbage collect deleted records.
          promises.push(conn.execute(statements.deleteData, {collection_name, record_id}));
        }
        else {
          const newRecord = {...record,
            _status: "created",
            last_modified: undefined,
          };
          promises.push(conn.execute(statements.updateData, {record: JSON.stringify(newRecord), record_id, collection_name}));
        }
      });
      yield Promise.all(promises);
      yield conn.execute(statements.clearCollectionMetadata);
    });
  }
}


function transactionProxy(collection, preloaded) {
  const _operations = [];

  return {
    get operations() {
      return _operations;
    },

    create(record) {
      _operations.push({
        statement: statements.createData,
        params: {
          collection_name: collection,
          record_id: record.id,
          record: JSON.stringify(record)
        }
      });
    },

    update(record) {
      _operations.push({
        statement: statements.updateData,
        params: {
          collection_name: collection,
          record_id: record.id,
          record: JSON.stringify(record)
        }
      });
    },

    delete(id) {
      _operations.push({
        statement: statements.deleteData,
        params: {
          collection_name: collection,
          record_id: id
        }
      });
    },

    get(id) {
      // Gecko JS engine outputs undesired warnings if id is not in preloaded.
      return id in preloaded ? preloaded[id] : undefined;
    }
  };
}

/**
 * Filter and sort list against provided filters and order.
 *
 * @param  {Object} filters  The filters to apply.
 * @param  {String} order    The order to apply.
 * @param  {Array}  list     The list to reduce.
 * @return {Array}
 */
export function reduceRecords(filters, order, list) {
  const filtered = filters ? filterObjects(filters, list) : list;
  return order ? sortObjects(order, filtered) : filtered;
}
