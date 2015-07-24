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
    db = new IDB("test/foo");
    return db.clear();
  });

  afterEach(() => sandbox.restore());

  describe("#open", () => {
    it("should resolve with current instance", () => {
      return db.open()
        .then(res => expect(res).eql(db));
    });
  });

  describe("#create", () => {
    it("should save a record record", () => {
      const data = {id: 1, foo: "bar"};
      return db.create(data)
        .then(data => db.list())
        .should.become([data]);
    });

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

  describe("#update", () => {
    it("should update a record", () => {
      const data = {id: 1, foo: "bar"};
      return db.create(data)
        .then(res => db.get(res.id))
        .then(existing => {
          return db.update(Object.assign({}, existing, {foo: "baz"}))
        })
        .then(res => db.get(res.id))
        .then(res => res.foo)
        .should.become("baz");
    });

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

  describe("#get", () => {
    var id;

    beforeEach(() => {
      return db.create({id: 1, foo: "bar"})
        .then(res => id = res.id);
    });

    it("should retrieve a record from its id", () => {
      return db.get(id)
        .then(res => res.foo)
        .should.eventually.eql("bar");
    });

    it("should return undefined when record is not found", () => {
      return db.get(999)
        .should.eventually.eql(undefined);
    });
  });

  describe("#delete", () => {
    var id;

    beforeEach(() => {
      return db.create({id: 1, foo: "bar"})
        .then(res => id = res.id);
    });

    it("should delete a record", () => {
      return db.delete(id)
        .then(res => db.get(id))
        .should.eventually.become(undefined);
    });

    it("should resolve with deleted id", () => {
      return db.delete(id)
        .should.eventually.eql(id);
    });

    it("should silently fail at deleting a non-existent record id", () => {
      return db.delete(999)
        .should.eventually.eql(999);
    });

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

  describe("#list", () => {
    beforeEach(() => {
      return Promise.all([
        db.create({id: 1, foo: "bar"}),
        db.create({id: 2, foo: "baz"}),
      ]);
    });

    it("should retrieve the list of records", () => {
      return db.list()
        .should.eventually.eql([
          {id: 1, foo: "bar"},
          {id: 2, foo: "baz"},
        ]);
    });

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
