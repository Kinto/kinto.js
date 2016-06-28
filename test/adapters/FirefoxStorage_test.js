"use strict";

import { expect } from "chai";
import sinon from "sinon";
import Task from "co-task";

// Stub a bunch of globals required by the FirefoxStorage module
global.Components = {
  utils: {
    import() {}
  }
};
global.Task = Task;
global.Sqlite = {
  openConnection() {
    return Promise.resolve(fakeConnection);
  }
};

const FirefoxAdapter = require("../../fx-src/FirefoxStorage").default;
const fakeConnection = {
  executeTransaction() {
    return Promise.resolve();
  }
};

describe("FirefoxStorage", () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  describe("#constructor()", () => {
    it("should create an object", () => {
      expect(new FirefoxAdapter()).to.be.an("object");
    });
  });

  describe("#open()", () => {
    it("should open a connection", () => {
      const adapter = new FirefoxAdapter();
      return adapter.open().should.be.fulfilled;
    });

    it("should use the filename given by options", () => {
      const adapter = new FirefoxAdapter("collection", {path: "storage-sync.sqlite"});
      const openConnection = sandbox.stub(global.Sqlite, "openConnection").returns(
        Promise.resolve(fakeConnection));
      return adapter.open().then(_ => {
        const firstArgs = openConnection.args[0];
        const options = firstArgs[0];
        expect(options).property("path").eql("storage-sync.sqlite");
      });
    });
  });

  describe("#execute()", () => {
    it("should execute a statement", (done) => {
      const adapter = new FirefoxAdapter("coll");
      adapter._connection = {
        executeTransaction(generator) {
          return Task.spawn(generator);
        },
        execute: function(stmt, params) {
          // count number of placeholders in the statement
          const nbPlaceholders = stmt.split("").filter(x => x === "?").length;
          expect(params.length).eql(nbPlaceholders);
          // ensure placeholder params are the one we expect
          expect(params).eql(["coll", 1, 2, 3]);
          done();
        }
      };

      return adapter.execute((txn) => {
        txn.create({foo: "bar"});
      }, {preload: [1, 2, 3]});
    });
  });
});
