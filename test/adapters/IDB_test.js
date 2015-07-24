"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";

import IDB from "../../src/adapters/IDB.js";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const root = typeof window === "object" ? window : global;

describe("adapters.IDB", () => {
  var sandbox, db;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    db = new IDB("testBucket", "testColl");
    return db.clear();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("#open", () => {
    it("should resolve with current instance", () => {
      return db.open()
        .then(res => expect(res).eql(db));
    });
  });

  describe("#create", function() {
    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").returns({
        store: {add() {}},
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({target: {error: "transaction error"}})
          }
        }
      });
      return db.create({foo: "bar"})
        .should.be.rejectedWith(Error, "transaction error");
    });

    it("should prefix error encountered", () => {
      sandbox.stub(db, "open").returns(Promise.reject("error"));
      return db.create().should.be.rejectedWith(Error, /^create/);
    });
  });

  describe("#update", function() {
    it("should reject on transaction error", () => {
      sandbox.stub(db, "get").returns(Promise.resolve());
      sandbox.stub(db, "prepare").returns({
        store: {get() {}, put() {}},
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({target: {error: "transaction error"}})
          }
        }
      });
      return db.update({id: 42, foo: "bar"})
        .should.be.rejectedWith(Error, "transaction error");
    });

    it("should prefix error encountered", () => {
      sandbox.stub(db, "open").returns(Promise.reject("error"));
      return db.update().should.be.rejectedWith(Error, /^update/);
    });
  });

  describe("#delete", function() {
    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").returns({
        store: {get() {}},
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({target: {error: "transaction error"}})
          }
        }
      });
      return db.get(42)
        .should.be.rejectedWith(Error, "transaction error");
    });

    it("should prefix error encountered", () => {
      sandbox.stub(db, "open").returns(Promise.reject("error"));
      return db.delete().should.be.rejectedWith(Error, /^delete/);
    });
  });

  describe("#list", function() {
    it("should prefix error encountered", () => {
      sandbox.stub(db, "open").returns(Promise.reject("error"));
      return db.list().should.be.rejectedWith(Error, /^list/);
    });

    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").returns({
        store: {openCursor() {return {}}},
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({target: {error: "transaction error"}})
          }
        }
      });
      return db.list({})
        .should.be.rejectedWith(Error, "transaction error");
    });
  });

  describe("#saveLastModified", () => {
    it("should resolve with lastModified value", () => {
      return db.saveLastModified(42)
        .should.eventually.become(42);
    });

    it("should save a lastModified value", () => {
      return db.saveLastModified(42)
        .then(_ => db.getLastModified())
        .should.eventually.become(42);
    });

    it("should allow updating previous value", () => {
      return db.saveLastModified(42)
        .then(_ => db.saveLastModified(43))
        .then(_ => db.getLastModified())
        .should.eventually.become(43);
    });
  });
});
