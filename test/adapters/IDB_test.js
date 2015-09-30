"use strict";

import sinon from "sinon";
import { expect } from "chai";

import IDB from "../../src/adapters/IDB.js";
import { adapterTestSuite } from "./common";

/** @test {IDB} */
describe("adapter.IDB", () => {
  adapterTestSuite(() => new IDB("test/foo"));

  describe("IDB specific tests", () => {
    var sandbox, db;

    beforeEach(() => {
      sandbox = sinon.sandbox.create();
      db = new IDB("test/foo");
      return db.clear();
    });

    afterEach(() => sandbox.restore());

    /** @test {IDB#batch} */
    describe("#batch", () => {
      describe("Succesful transaction", () => {
        function successfulBatch() {
          return db.batch(batch => {
            batch.create({id: 1, name: "foo"});
            batch.create({id: 2, name: "bar"});
          });
        }

        it("should resolve with the list of successful operations", () => {
          return successfulBatch()
            .should.eventually.have.property("operations").eql([
              {type: "create", data: {id: 1, name: "foo"}},
              {type: "create", data: {id: 2, name: "bar"}},
            ]);
        });

        it("should resolve with the list of errors", () => {
          return successfulBatch()
            .should.eventually.have.property("errors").eql([]);
        });

        it("should batch create records", () => {
          return successfulBatch()
            .then(_ => db.list())
            .should.become([
              {id: 1, name: "foo"},
              {id: 2, name: "bar"},
            ]);
        });

        it("should perform different crud operations in order", () => {
          return db.create({id: 1, name: "foo"})
            .then(_ => db.batch(batch => {
              batch.delete(1);
              batch.create({id: 2, name: "bar"});
              batch.update({id: 2, name: "baz"});
            }))
            .then(_ => db.list())
            .should.become([{id: 2, name: "baz"}]);
        });
      });

      describe("Failing transaction", () => {
        it("should expose failing operation errors", () => {
          return db.batch(batch => {
            batch.create({id: 1, name: "foo"});
            batch.create({id: 2, name: "bar"});
            batch.create(1);
            batch.create(2);
          })
            .then(res => {
              expect(res.errors).to.have.length.of(2);
              expect(res.errors[0].error.name).eql("DataError");
              expect(res.errors[0].operation).eql({type: "create", data: 1});
              expect(res.errors[1].error.name).eql("DataError");
              expect(res.errors[1].operation).eql({type: "create", data: 2});
            });
        });

        it("should not alter database on transaction error", () => {
          return db.create({id: 1, name: "foo"})
            .then(_ => db.batch(batch => {
              batch.create({id: 2, name: "bar"});
              batch.create({id: 3, name: "baz"});
              batch.create({id: 1, name: "foo-dupe"}); // dupe
              batch.create({id: 4, name: "qux"});
            }))
            .then(_ => db.list())
            .should.become([{id: 1, name: "foo"}]);
        });
      });

      describe("#batch.get", () => {
        it("should allow performing a get operation within a batch", () => {
          return db.create({id: 1, name: "foo"})
            .then(_ => {
              return db.batch(batch => {
                return batch.get(1)
                  .then(res => {
                    batch.update({id: 1, name: `Hello ${res.name}`});
                  });
              });
            })
            .then(res => expect(res).eql({
              errors: [],
              operations: [{
                type: "update",
                data: {id: 1, name: "Hello foo"}
              }],
            }));
        });
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
  });
});
