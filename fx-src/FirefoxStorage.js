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
      VALUES (:collection_name, :record_id, :record)`,

  "updateData": `
    UPDATE collection_data
      SET record = :record
        WHERE collection_name = :collection_name
        AND record_id = :record_id`,

  "deleteData": `
    DELETE FROM collection_data
      WHERE collection_name = :collection_name
      AND record_id = :record_id`,

  "saveLastModified": `
    REPLACE INTO collection_metadata (collection_name, last_modified)
      VALUES (:collection_name, :last_modified)`,

  "getLastModified": `
    SELECT last_modified
      FROM collection_metadata
        WHERE collection_name = :collection_name`,

  "getRecord": `
    SELECT record
      FROM collection_data
        WHERE collection_name = :collection_name
        AND record_id = :record_id`,

  "listRecords": `
    SELECT record
      FROM collection_data
        WHERE collection_name = :collection_name`
};

const createStatements = ["createCollectionData",
                          "createCollectionMetadata",
                          "createCollectionDataRecordIdIndex"];

export default class FirefoxAdapter extends BaseAdapter {
  constructor(dbname) {
    super();
    this.dbname = dbname;

    // make a promise to initialize
    const self = this;
    this.init = Task.spawn(function* () {
      let connection;
      try {
        connection = yield self._doOpenConnection();
        yield connection.executeTransaction(function* doSetup() {
          let schema = yield (connection.getSchemaVersion());

          if (schema == 0) {

            for (let statementName of createStatements) {
              yield (connection.execute(statements[statementName]));
            }

            yield (connection.setSchemaVersion(1));
          } else if (schema != 1) {
            throw new Error("Unknown database schema: " + schema);
          }
        });
        self.initialized = true;
      } finally {
        if (connection) {
          connection.close();
        }
      }
    });
  }

  _doOpenConnection() {
    const opts = { path: "kinto.sqlite", sharedMemoryCache: false }
    return Sqlite.openConnection(opts);
  }

  _doTransaction(statement, params){
    const self = this;
    return Task.spawn(function* (){
      // get a connection
      let connection = yield self._doOpenConnection();

      // ensure we're initialized
      yield self.init;

      //execute the transaction
      try {
        return yield connection.executeCached(statement, params);
      }
      finally {
        // ensure the connection is closed
        connection.close();
      }
    });
  }

  clear() {
    const params = {collection_name: this.dbname};
    return this._doTransaction(statements.clearData, params);
  }

  create(record) {
    const params = {
      collection_name: this.dbname,
      record_id: record.id,
      record: JSON.stringify(record)
    };
    return this._doTransaction(statements.createData, params).then(() => {
      return record;
    });
  }

  update(record) {
    const params = {
      collection_name: this.dbname,
      record_id: record.id,
      record: JSON.stringify(record)
    };
    return this._doTransaction(statements.updateData, params).then(() => {
      return record;
    });
  }

  get(id) {
      const params = {
        collection_name: this.dbname,
        record_id: id,
      };
      return this._doTransaction(statements.getRecord, params).then(result => {
        if (result.length == 0) {
          return;
        }
        return JSON.parse(result[0].getResultByName("record"));
      });
    }

  delete(id) {
    const params = {
      collection_name: this.dbname,
      record_id: id,
    };
    return this._doTransaction(statements.deleteData, params).then(() => {
      return id;
    });
  }

  list() {
    const params = {
      collection_name: this.dbname,
    };
    return this._doTransaction(statements.listRecords, params).then(result => {
      const records = [];
      for (let k = 0; k < result.length; k++) {
        let row = result[k];
        records.push(JSON.parse(row.getResultByName("record")));
      }
      return records;
    });
  }

  saveLastModified(lastModified) {
    const parsedLastModified = parseInt(lastModified, 10) || null;
    const params = {
      collection_name: this.dbname,
      last_modified: parsedLastModified,
    };
    return this._doTransaction(statements.saveLastModified, params).then(() => {
      return parsedLastModified;
    });
  }

  getLastModified() {
    const params = {
      collection_name: this.dbname,
    };
    return this._doTransaction(statements.getLastModified, params).then(result => {
      if (result.length == 0) {
        return 0;
      }
      return result[0].getResultByName("last_modified");
    });
  }
}
