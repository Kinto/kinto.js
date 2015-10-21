import BaseAdapter from "../src/adapters/base";

const { interfaces: Ci, results: Cr, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");

function debug(message) {
  // TODO: Read a pref or something to work out whether to emit debug
  // messages
  dump("FirefoxStorage "+message+"\n\n");
}

// A way to handle our storage connection and storage statements
class KintoStorage {
  constructor(dbname) {
    this.dbname = dbname;
    this.file = FileUtils.getFile("ProfD", ["kinto.sqlite"]);
    this.statements = {};
  }

  getStatement(statementString) {
    debug("getStatement for "+statementString);
    let statement = this.statements[statementString];
    if (statement) {
      debug("statement exists");
      if (statement.reset) {
        statement.reset();
      }
    } else {
      debug("statement does not exist; creating");
      const dbconn = this.getConnection();
      if (dbconn) {
        debug("connection is ready? "+dbconn.connectionReady);
        statement = dbconn.createAsyncStatement(statementString);
        this.statements[statementString] = statement;
      } else {
        debug("unable to get a database connection");
      }
    }
    return statement;
  }

  getName() {
    return this.dbname;
  }

  getConnection() {
    if (!this._dbconn) {
      try {
        this._dbconn = Services.storage.openDatabase(this.file);
      } catch (e) {
        if (e.result == Cr.NS_ERROR_FILE_CORRUPTED) {
          debug("database is corrupted - will backup");
          // Database is corrupted; backup and remove the database, then throw
          this.cleanup();
        }
        throw e;
      }
    }
    return this._dbconn;
  }

  cleanup() {
    // Create backup file
    const backupFile = this.file.leafName + ".corrupt";
    Services.storage.backupDatabaseFile(this.file, backupFile);

    if (this._dbconn) {
      try {
        // Honey-badger closing (we can't do anything about failure here)
        this._dbconn.close();
      } catch (e) {}
    }
    this.file.remove(false);
    debug("all cleaned up");
  }

  requestAsyncClose() {
    // ensure all statements are finalized
    for (let statementString in this.statements) {
      debug("finalizing "+statementString);
      this.statements[statementString].finalize();
    }

    function connectionClosed() {
      debug("connection closed");
    }

    // close the connection
    if (this._dbconn) {
      debug("closing the connection");
      this._dbconn.asyncClose(connectionClosed());
      this._dbconn = null;
      this.statements = {};
    }
  }
}

export default class FirefoxAdapter extends BaseAdapter {
  constructor(dbname) {
    super();
    this.operations = [];
    this.busy = false;


    // attempt creation - we don't need to use a transaction here since our
    // operation queue means these will happen before other operations.
    const statements = ["CREATE TABLE IF NOT EXISTS collection_metadata (collection_name TEXT PRIMARY KEY, last_modified INTEGER) WITHOUT ROWID;",
          "CREATE TABLE IF NOT EXISTS collection_data (collection_name TEXT, record_id TEXT, record TEXT);",
          "CREATE UNIQUE INDEX IF NOT EXISTS unique_collection_record ON collection_data(collection_name, record_id);"];

    this.kintoStorage = new KintoStorage(dbname);

    for (let stmt of statements) {
      this.executeUpdate(stmt);
    }
  }

  executeUpdate(sql) {
    debug("requesting to execute statement: "+sql);
    this.executeOperation(function(kintoStorage, complete) {
      debug("executing statement: "+sql);
      const statement = kintoStorage.getStatement(sql);

      statement.executeAsync({
        handleError: function(aError) {
          debug("Error: " + aError.message);
        },

        handleCompletion: function(aReason) {
          if (aReason != Ci.mozIStorageStatementCallback.REASON_FINISHED) {
            debug("Query canceled or aborted!");
          } else {
            debug("Query complete");
          }
          complete();
        }
      });
    });
  }

  executeOperation(op) {
    debug("executeOperation");
    if (!this.busy) {
      debug("Executing operation now");
      this.busy = true;
      function executeNextOperation() {
        debug("executeNextOperation");
        const next = this.operations.shift();
        if (next) {
          debug("executing queued operation");
          next(this.kintoStorage, executeNextOperation.bind(this));
        } else {
          debug("cleaning up");
          this.busy = false;
          this.kintoStorage.requestAsyncClose();
          debug("work queue complete");
        }
      }
      op(this.kintoStorage, executeNextOperation.bind(this));
    } else {
      debug("queuing operation");
      this.operations.push(op);
    }
  }

  clear() {
    return new Promise((resolve, reject) => {
      this.executeOperation((kintoStorage, complete) => {
        debug("kinto::clear");
        // clear all of the data for this adapter
        const statement = kintoStorage.getStatement("DELETE FROM collection_data WHERE collection_name = :collection_name;");
        statement.params.collection_name = kintoStorage.getName();

        // execute the statement
        statement.executeAsync({
          handleResult: function(aResultSet) {
            debug("A result set was not expected");
          },

          handleError: function(aError) {
            debug("Error: " + aError.message);
            reject(new Error(aError.message));
          },

          handleCompletion: function(aReason) {
            if (aReason != Ci.mozIStorageStatementCallback.REASON_FINISHED) {
              debug("Query canceled or aborted!");
              reject(new Error("query cancelled or aborted"));
            } else {
              resolve();
            }
            complete();
          }
        });
      });
    }).then(() => {
      return this.saveLastModified(1);
    });
  }

  create(record) {
    return new Promise((resolve, reject) => {
      if (record && record.id) {
        this.executeOperation((kintoStorage, complete) => {
          debug("kinto::create");
          // insert a row for this record
          const statement = kintoStorage.getStatement("INSERT INTO collection_data (collection_name, record_id, record) VALUES (:collection_name, :record_id, :record)");
          statement.params.collection_name = kintoStorage.getName();
          statement.params.record_id = record.id;
          statement.params.record = JSON.stringify(record);

          // execute the statement
          statement.executeAsync({
            handleResult: () => {
              debug("A result set was not expected");
            },

            handleError: aError => {
              debug("Error: " + aError.message);
              reject(aError);
            },

            handleCompletion: aReason => {
              if (aReason != Ci.mozIStorageStatementCallback.REASON_FINISHED) {
                debug("Query canceled or aborted!");
                reject(new Error("query cancelled or aborted"));
              } else {
                resolve(record);
              }
              complete();
            }
          });
        });
      } else {
        reject(new Error("record or record id missing"));
      }
    });
  }

  update(record) {
    return new Promise((resolve, reject) => {
      // update the entry for this record
      if (record && record.id) {
        this.executeOperation((kintoStorage, complete) => {
          debug("kinto::update");
          const statement = kintoStorage.getStatement("UPDATE collection_data SET record = :record WHERE collection_name = :collection_name AND record_id = :record_id");
          statement.params.record = JSON.stringify(record);
          statement.params.collection_name = kintoStorage.getName();
          statement.params.record_id = record.id;

          // execute the statement
          statement.executeAsync({
            handleResult: () => {
              debug("A result set was not expected");
            },

            handleError: aError => {
              debug("Error: " + aError.message);
              reject(aError);
            },

            handleCompletion: aReason => {
              if (aReason != Ci.mozIStorageStatementCallback.REASON_FINISHED) {
                debug("Query canceled or aborted!");
                reject(new Error("query cancelled or aborted"));
              } else {
                resolve(record);
              }
              complete();
            }
          });
        });
      } else {
        reject(new Error("record or record id missing"));
      }
    });
  }

  get(id) {
    // get a record with the specified ID
    return new Promise((resolve, reject) => {
      debug("kinto::get");
      if (id) {
        this.executeOperation((kintoStorage, complete) => {
          const statement = kintoStorage.getStatement("SELECT record FROM collection_data WHERE collection_name = :collection_name AND record_id = :record_id");
          statement.params.collection_name = kintoStorage.getName();
          statement.params.record_id = id;

          // execute the statement
          let value = undefined;

          statement.executeAsync({
            handleResult: aResultSet => {
              debug("result set obtained:");
              for (let row = aResultSet.getNextRow(); row; row = aResultSet.getNextRow()) {
                value = row.getResultByName("record");
                debug(value);
                let result = JSON.parse(value);
                return resolve(result);
              }
              resolve(undefined);
            },

            handleError: aError => {
              debug("Error: " + aError.message);
              reject(aError);
            },

            handleCompletion: aReason => {
              if (aReason != Ci.mozIStorageStatementCallback.REASON_FINISHED) {
                debug("Query canceled or aborted!");
                reject(new Error("query cancelled or aborted"));
              }
              if (!value) {
                resolve(undefined);
              }
              complete();
            }
          });
        });
      } else {
        reject(new Error("missing record id"));
      }
    });
  }

  delete(id) {
    return new Promise((resolve,reject) => {
      if (id) {
        this.executeOperation((kintoStorage, complete) => {
          debug("kinto::delete");
          // delete the record with the specified ID
          const statement = kintoStorage.getStatement("DELETE FROM collection_data WHERE collection_name = :collection_name AND record_id = :record_id");
          statement.params.collection_name = kintoStorage.getName();
          statement.params.record_id = id;

          // execute the statement
          statement.executeAsync({
            handleResult: () => {
              debug("A result set was not expected");
            },

            handleError: aError => {
              debug("Error: " + aError.message);
              reject(aError);
            },

            handleCompletion: aReason => {
              if (aReason != Ci.mozIStorageStatementCallback.REASON_FINISHED) {
                debug("Query canceled or aborted!");
                reject(new Error("query cancelled or aborted"));
              } else {
                resolve(id);
              }
              complete();
            }
          });
        });
      } else {
        reject(new Error("missing record id"));
      }
    });
  }

  list() {
    return new Promise((resolve, reject) => {
      this.executeOperation((kintoStorage, complete) => {
        debug("kinto::list");

        // list the records
        const statement = kintoStorage.getStatement("SELECT record FROM collection_data WHERE collection_name = :collection_name");
        statement.params.collection_name = kintoStorage.getName();

        const results = [];

        // execute the statement
        statement.executeAsync({
          handleResult: aResultSet => {
            debug("result set obtained:");
            for (let row = aResultSet.getNextRow(); row; row = aResultSet.getNextRow()) {
              let value = row.getResultByName("record");
              debug(value);
              results[results.length] = JSON.parse(value);
            }
          },

          handleError: aError => {
            debug("Error: " + aError.message);
            reject(aError);
          },

          handleCompletion: aReason => {
            if (aReason != Ci.mozIStorageStatementCallback.REASON_FINISHED) {
              debug("Query canceled or aborted!");
              reject(new Error("query cancelled or aborted"));
            } else {
              resolve(results);
            }
            complete();
          }
        });
      });
    });
  }

  saveLastModified(lastModified) {
    // store the last modified data
    return new Promise((resolve,reject) => {
      if (lastModified) {
        this.executeOperation((kintoStorage, complete) => {
          const statement = kintoStorage.getStatement("REPLACE INTO collection_metadata (collection_name, last_modified) VALUES (:collection_name, :last_modified)");
          statement.params.collection_name = kintoStorage.getName();
          statement.params.last_modified = lastModified;

          // execute the statement
          statement.executeAsync({
            handleResult: () => {
              debug("A result set was not expected");
            },

            handleError: aError => {
              debug("Error: " + aError.message);
              reject(aError);
            },

            handleCompletion: aReason => {
              if (aReason != Ci.mozIStorageStatementCallback.REASON_FINISHED) {
                debug("Query canceled or aborted!");
                reject(new Error("query cancelled or aborted"));
              } else {
                resolve(lastModified);
              }
              complete();
            }
          });
        });
      } else {
        reject(new Error("missing lastModified"));
      }
    });
  }

  getLastModified() {
    return new Promise((resolve, reject) => {
      debug("kinto::getLastModified");
      this.executeOperation((kintoStorage, complete) => {
        // retrieve the last modified data
        const statement = kintoStorage.getStatement("SELECT last_modified FROM collection_metadata WHERE collection_name = :collection_name");
        statement.params.collection_name = kintoStorage.getName();
        let result = 0;

        // execute the statement
        statement.executeAsync({
          handleResult: aResultSet => {
            debug("result set obtained:");
            for (let row = aResultSet.getNextRow(); row; row = aResultSet.getNextRow()) {
                let value = row.getResultByName("last_modified");
                debug(value);
                result = JSON.parse(value);
              }
          },

          handleError: aError => {
            debug("Error: " + aError.message);
            reject(aError);
          },

          handleCompletion: aReason => {
            if (aReason != Ci.mozIStorageStatementCallback.REASON_FINISHED) {
              debug("Query canceled or aborted!");
              reject(new Error("query cancelled or aborted"));
            } else {
              debug("last modified result was "+result);
              resolve(result);
            }
            complete();
          }
        });
      });
    });
  }
}
