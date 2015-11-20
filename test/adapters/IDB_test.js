"use strict";

import sinon from "sinon";

import IDB from "../../src/adapters/IDB.js";
import { adapterTestSuite } from "./common";

/** @test {IDB} */
describe("adapter.IDB", () => {
  adapterTestSuite(() => new IDB("test/foo"));

  describe("IDB specific tests", () => {
    let sandbox, db;

    beforeEach(() => {
      sandbox = sinon.sandbox.create();
      db = new IDB("test/foo");
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

      it("should be fullfilled when no connection has been opened", () => {
        db._db = null;
        return db.close().should.be.fulfilled;
      });

      it("should close an opened connection to the database", () => {
        return db.close()
          .then(_ => db._db)
          .should.become(null);
      });
    });

    /** @test {IDB#create} */
    describe("#create", () => {
      it("should reject on transaction error", () => {
        sandbox.stub(db, "prepare").returns({
          store: {add() {}},
          transaction: {
            get onerror() {},
            set onerror(onerror) {
              onerror({target: {error: "transaction error"}});
            }
          }
        });
        return db.create({foo: "bar"})
          .should.be.rejectedWith(Error, "transaction error");
      });

      it("should prefix error encountered", () => {
        sandbox.stub(db, "open").returns(Promise.reject("error"));
        return db.create().should.be.rejectedWith(Error, /^Error: create/);
      });
    });

    /** @test {IDB#update} */
    describe("#update", () => {
      it("should reject on transaction error", () => {
        sandbox.stub(db, "get").returns(Promise.resolve());
        sandbox.stub(db, "prepare").returns({
          store: {get() {}, put() {}},
          transaction: {
            get onerror() {},
            set onerror(onerror) {
              onerror({target: {error: "transaction error"}});
            }
          }
        });
        return db.update({id: 42, foo: "bar"})
          .should.be.rejectedWith(Error, "transaction error");
      });

      it("should prefix error encountered", () => {
        sandbox.stub(db, "open").returns(Promise.reject("error"));
        return db.update().should.be.rejectedWith(Error, /^Error: update/);
      });
    });

    /** @test {IDB#get} */
    describe("#get", () => {
      beforeEach(() => {
        return db.create({id: 1, foo: "bar"});
      });

      it("should return undefined when record is not found", () => {
        return db.get(999)
          .should.eventually.eql(undefined);
      });
    });

    /** @test {IDB#delete} */
    describe("#delete", () => {
      beforeEach(() => {
        return db.create({id: 1, foo: "bar"});
      });

      it("should reject on transaction error", () => {
        sandbox.stub(db, "prepare").returns({
          store: {get() {}},
          transaction: {
            get onerror() {},
            set onerror(onerror) {
              onerror({target: {error: "transaction error"}});
            }
          }
        });
        return db.get(42)
          .should.be.rejectedWith(Error, "transaction error");
      });

      it("should prefix error encountered", () => {
        sandbox.stub(db, "open").returns(Promise.reject("error"));
        return db.delete().should.be.rejectedWith(Error, /^Error: delete/);
      });
    });

    /** @test {IDB#list} */
    describe("#list", () => {
      it("should prefix error encountered", () => {
        sandbox.stub(db, "open").returns(Promise.reject("error"));
        return db.list().should.be.rejectedWith(Error, /^Error: list/);
      });

      it("should reject on transaction error", () => {
        sandbox.stub(db, "prepare").returns({
          store: {openCursor() {return {};}},
          transaction: {
            get onerror() {},
            set onerror(onerror) {
              onerror({target: {error: "transaction error"}});
            }
          }
        });
        return db.list({})
          .should.be.rejectedWith(Error, "transaction error");
      });
    });

    /** @test {IDB#loadDump} */
    describe("#loadDump", () => {
      it("should reject on transaction error", () => {
        sandbox.stub(db, "prepare").returns({
          store: {add() {}},
          transaction: {
            get onerror() {},
            set onerror(onerror) {
              onerror({target: {error: "transaction error"}});
            }
          }
        });
        return db.loadDump([{foo: "bar"}])
          .should.be.rejectedWith(Error, /^Error: loadDump/);
      });
    });
  });
});
