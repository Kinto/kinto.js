"use strict";

import sinon from "sinon";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";

import LocalStorage from "../../src/adapters/LocalStorage.js";
import { adapterTestSuite } from "./common";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

function thrower(msg) {
  return () => {
    throw new Error(msg);
  };
}

describe("adapter.LocalStorage", () => {
  adapterTestSuite(() => new LocalStorage("test/foo"));

  /** @test {LocalStorage} */
  describe("LocalStorage specific tests", () => {
    let sandbox, db;

    beforeEach(() => {
      sandbox = sinon.sandbox.create();
      db = new LocalStorage("test/foo");
      return db.clear();
    });

    afterEach(() => sandbox.restore());

    /** @test {IDB#open} */
    describe("#open", () => {
      it("should be fullfilled when a connection is opened", () => {
        return db.open().should.be.fulfilled;
      });
    });

    /** @test {IDB#close} */
    describe("#close", () => {
      it("should be fullfilled when a connection is closed", () => {
        return db.close().should.be.fulfilled;
      });
    });

    /** @test {LocalStorage#clear} */
    describe("#clear", () => {
      it("should reject on generic error", () => {
        sandbox.stub(localStorage, "clear", thrower("err"));
        return db.clear()
          .should.be.rejectedWith(Error, /^Error: clear\(\) err/);
      });
    });

    /** @test {LocalStorage#create} */
    describe("#create", () => {
      it("should add created key to the key list", () => {
        return db.create({id: 1})
          .then(_ => expect(db.keys).eql([1]));
      });

      it("should reject on existing id", () => {
        db.keys = [1];
        return db.create({id: 1})
          .should.be.rejectedWith(Error, /Exists/);
      });

      it("should reject on generic error", () => {
        sandbox.stub(localStorage, "setItem", thrower("err"));
        return db.create({})
          .should.be.rejectedWith(Error, /^Error: create/);
      });
    });

    /** @test {LocalStorage#update} */
    describe("#update", () => {
      it("should reject on id not found", () => {
        return db.update({id: 1})
          .should.be.rejectedWith(Error, /^Error: Doesn't exist/);
      });

      it("should reject on generic error", () => {
        db.keys = [1];
        sandbox.stub(localStorage, "setItem", thrower("err"));
        return db.update({id: 1})
          .should.be.rejectedWith(Error, /^Error: update/);
      });
    });

    /** @test {LocalStorage#get} */
    describe("#get", () => {
      it("should reject on generic error", () => {
        sandbox.stub(localStorage, "getItem", thrower("err"));
        return db.get(1)
          .should.be.rejectedWith(Error, /^Error: get\(\) err/);
      });
    });

    /** @test {LocalStorage#delete} */
    describe("#delete", () => {
      it("should remove deleted key to the key list", () => {
        db.keys = [1];
        return db.delete(1)
          .then(_ => expect(db.keys).eql([]));
      });

      it("should reject on generic error", () => {
        sandbox.stub(localStorage, "removeItem", thrower("err"));
        return db.delete(42)
          .should.be.rejectedWith(Error, /^Error: delete\(\) err/);
      });
    });

    /** @test {LocalStorage#list} */
    describe("#list", () => {
      it("should reject on generic error", () => {
        sandbox.stub(JSON, "parse", thrower("err"));
        return db.list()
          .should.be.rejectedWith(Error, /^Error: list\(\) err/);
      });
    });

    /** @test {LocalStorage#saveLastModified} */
    describe("#saveLastModified", () => {
      it("should reject on generic error", () => {
        sandbox.stub(localStorage, "setItem", thrower("err"));
        return db.saveLastModified(42)
          .should.be.rejectedWith(Error, /^Error: saveLastModified\(\) err/);
      });
    });

    /** @test {LocalStorage#getLastModified} */
    describe("#getLastModified", () => {
      it("should reject on generic error", () => {
        sandbox.stub(JSON, "parse", thrower("err"));
        return db.getLastModified()
          .should.be.rejectedWith(Error, /^Error: getLastModified\(\) err/);
      });
    });

    /** @test {LocalStorage#loadDump} */
    describe("#loadDump", () => {
      it("should reject on generic error", () => {
        sandbox.stub(localStorage, "setItem", thrower("err"));
        return db.loadDump([{foo: "bar"}])
          .should.be.rejectedWith(Error, /^Error: loadDump\(\) err/);
      });
    });
  });
});

