"use strict";

import { expect } from "chai";
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
    return Promise.resolve({
      executeTransaction() {
        return Promise.resolve();
      }
    });
  }
};

const FirefoxAdapter = require("../../fx-src/FirefoxStorage").default;


describe("FirefoxStorage", () => {
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
