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

import BaseAdapter from "../src/adapters/base";

Components.utils.import("resource://gre/modules/Sqlite.jsm");
Components.utils.import("resource://gre/modules/Task.jsm");

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
    UPDATE collection_data
      SET record = :record
        WHERE collection_name = :collection_name
        AND record_id = :record_id;`,

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

  "importData": `
    REPLACE INTO collection_data (collection_name, record_id, record)
      VALUES (:collection_name, :record_id, :record);`

};

const createStatements = ["createCollectionData",
                          "createCollectionMetadata",
                          "createCollectionDataRecordIdIndex"];

const currentSchemaVersion = 1;

export default class FirefoxAdapter extends BaseAdapter {
  constructor(collection) {
    super();
    this.collection = collection;
  }

  _init(connection) {
    return Task.spawn(function* () {
      yield connection.executeTransaction(function* doSetup() {
        let schema = yield connection.getSchemaVersion();

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
      const opts = { path: "kinto.sqlite", sharedMemoryCache: false }
      if (!self._connection) {
        self._connection = yield Sqlite.openConnection(opts).then(self._init);
      }
    });
  }

  close() {
    if (this._connection) {
      let promise = this._connection.close();
      this._connection = null;
      return promise;
    }
    return Promise.resolve();
  }

  clear() {
    const params = {collection_name: this.collection};
    return this._executeStatement(statements.clearData, params);
  }

  create(record) {
    const params = {
      collection_name: this.collection,
      record_id: record.id,
      record: JSON.stringify(record)
    };
    return this._executeStatement(statements.createData, params)
               .then(() => record);
  }

  update(record) {
    const params = {
      collection_name: this.collection,
      record_id: record.id,
      record: JSON.stringify(record)
    };
    return this._executeStatement(statements.updateData, params)
               .then(() => record);
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

  delete(id) {
    const params = {
      collection_name: this.collection,
      record_id: id,
    };
    return this._executeStatement(statements.deleteData, params)
           .then(() => id);
  }

  list() {
    const params = {
      collection_name: this.collection,
    };
    return this._executeStatement(statements.listRecords, params)
           .then(result => {
      const records = [];
      for (let k = 0; k < result.length; k++) {
        let row = result[k];
        records.push(JSON.parse(row.getResultByName("record")));
      }
      return records;
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
    let connection = this._connection;
    let collection_name = this.collection;
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
            return result ? result[0].getResultByName('last_modified') : -1;
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
}
