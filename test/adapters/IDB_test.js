"use strict";

import sinon from "sinon";
import { expect } from "chai";

import IDB from "../../src/adapters/IDB.js";
import { v4 as uuid4 } from "uuid";

/** @test {IDB} */
describe("adapter.IDB", () => {
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

    it("should reject on open request error", () => {
      const fakeOpenRequest = {};
      sandbox.stub(indexedDB, "open").returns(fakeOpenRequest);
      const db = new IDB("another/db");
      const prom = db.open(indexedDB);

      fakeOpenRequest.onerror({ target: { error: "fail" } });

      return prom.should.be.rejectedWith("fail");
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
      return db.close().then(_ => db._db).should.become(null);
    });
  });

  /** @test {IDB#clear} */
  describe("#clear", () => {
    it("should clear the database", () => {
      return db
        .execute(transaction => {
          transaction.create({ id: 1 });
          transaction.create({ id: 2 });
        })
        .then(() => db.clear())
        .then(() => db.list())
        .should.eventually.have.length.of(0);
    });

    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").returns({
        store: {
          clear() {
            return {};
          },
        },
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({ target: { error: "transaction error" } });
          },
        },
      });
      return db.clear().should.be.rejectedWith(Error, "transaction error");
    });
  });

  /** @test {IDB#execute} */
  describe("#execute", () => {
    it("should return a promise", () => {
      return db.execute(() => {}).should.be.fulfilled;
    });

    describe("No preloading", () => {
      it("should open a connection to the db", () => {
        const open = sandbox.stub(db, "open").returns(Promise.resolve());

        return db.execute(() => {}).then(_ => sinon.assert.calledOnce(open));
      });

      it("should execute the specified callback", () => {
        const callback = sandbox.spy();
        return db.execute(callback).then(() => sinon.assert.called(callback));
      });

      it("should fail if the callback returns a promise", () => {
        const callback = () => Promise.resolve();
        return db
          .execute(callback)
          .should.eventually.be.rejectedWith(Error, /Promise/);
      });

      it("should rollback if the callback fails", () => {
        const callback = transaction => {
          transaction.execute(t => t.create({ id: 1, foo: "bar" }));
          throw new Error("Unexpected");
        };
        return db.execute(callback).catch(() => db.list()).should.become([]);
      });

      it("should provide a transaction parameter", () => {
        const callback = sandbox.spy();
        return db.execute(callback).then(() => {
          const handler = callback.getCall(0).args[0];
          expect(handler).to.have.property("get").to.be.a("function");
          expect(handler).to.have.property("create").to.be.a("function");
          expect(handler).to.have.property("update").to.be.a("function");
          expect(handler).to.have.property("delete").to.be.a("function");
        });
      });

      it("should create a record", () => {
        const data = { id: 1, foo: "bar" };
        return db
          .execute(t => t.create(data))
          .then(() => db.list())
          .should.become([data]);
      });

      it("should update a record", () => {
        const data = { id: 1, foo: "bar" };
        return db
          .execute(t => t.create(data))
          .then(_ => {
            return db.execute(transaction => {
              transaction.update({ ...data, foo: "baz" });
            });
          })
          .then(_ => db.get(data.id))
          .then(res => res.foo)
          .should.become("baz");
      });

      it("should delete a record", () => {
        const data = { id: 1, foo: "bar" };
        return db
          .execute(t => t.create(data))
          .then(_ => {
            return db.execute(transaction => {
              transaction.delete(data.id);
            });
          })
          .then(_ => db.get(data.id))
          .should.become(undefined);
      });

      it("should reject on store method error", () => {
        sandbox.stub(db, "prepare").returns({
          store: {
            index() {
              return {
                openCursor: () => ({
                  set onsuccess(cb) {
                    cb({ target: {} });
                  },
                }),
              };
            },
            add() {
              throw new Error("add error");
            },
          },
          transaction: {
            abort() {},
          },
        });
        return db
          .execute(transaction => transaction.create())
          .should.be.rejectedWith(Error, "add error");
      });

      it("should reject on transaction error", () => {
        sandbox.stub(db, "prepare").returns({
          store: {
            index() {
              return {
                openCursor: () => ({
                  set onsuccess(cb) {
                    cb({ target: {} });
                  },
                }),
              };
            },
            add() {},
          },
          transaction: {
            get onerror() {},
            set onerror(onerror) {
              onerror({ target: { error: "transaction error" } });
            },
          },
        });
        return db
          .execute(transaction => transaction.create({}))
          .should.be.rejectedWith(Error, "transaction error");
      });
    });

    describe("Preloaded records", () => {
      const articles = [{ id: 1, title: "title1" }, { id: 2, title: "title2" }];

      it("should expose preloaded records using get()", () => {
        return db
          .execute(t => articles.map(a => t.create(a)))
          .then(_ => {
            return db.execute(
              transaction => {
                return [transaction.get(1), transaction.get(2)];
              },
              { preload: articles.map(article => article.id) }
            );
          })
          .should.become(articles);
      });
    });
  });

  /** @test {IDB#get} */
  describe("#get", () => {
    beforeEach(() => {
      return db.execute(t => t.create({ id: 1, foo: "bar" }));
    });

    it("should retrieve a record from its id", () => {
      return db.get(1).then(res => res.foo).should.eventually.eql("bar");
    });

    it("should return undefined when record is not found", () => {
      return db.get(999).should.eventually.eql(undefined);
    });

    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").returns({
        store: {
          get() {
            return {};
          },
        },
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({ target: { error: "transaction error" } });
          },
        },
      });
      return db.get().should.be.rejectedWith(Error, "transaction error");
    });
  });

  /** @test {IDB#list} */
  describe("#list", () => {
    beforeEach(() => {
      return db.execute(transaction => {
        for (let id = 1; id <= 10; id++) {
          // id is indexed, name is not
          transaction.create({ id, name: "#" + id });
        }
      });
    });

    it("should retrieve the list of records", () => {
      return db.list().should.eventually.have.length.of(10);
    });

    it("should prefix error encountered", () => {
      sandbox.stub(db, "open").returns(Promise.reject("error"));
      return db.list().should.be.rejectedWith(Error, /^list()/);
    });

    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").returns({
        store: {
          openCursor() {
            return {};
          },
        },
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({ target: { error: "transaction error" } });
          },
        },
      });
      return db.list().should.be.rejectedWith(Error, "transaction error");
    });

    describe("Filters", () => {
      describe("on non-indexed fields", () => {
        describe("single value", () => {
          it("should filter the list on a single pre-indexed column", () => {
            return db
              .list({ filters: { name: "#4" } })
              .should.eventually.eql([{ id: 4, name: "#4" }]);
          });
        });

        describe("multiple values", () => {
          it("should filter the list on a single pre-indexed column", () => {
            return db
              .list({ filters: { name: ["#4", "#5"] } })
              .should.eventually.eql([
                { id: 4, name: "#4" },
                { id: 5, name: "#5" },
              ]);
          });

          it("should handle non-existent keys", () => {
            return db
              .list({ filters: { name: ["#4", "qux"] } })
              .should.eventually.eql([{ id: 4, name: "#4" }]);
          });
        });
      });

      describe("on indexed fields", () => {
        describe("single value", () => {
          it("should filter the list on a single pre-indexed column", () => {
            return db
              .list({ filters: { id: 4 } })
              .should.eventually.eql([{ id: 4, name: "#4" }]);
          });
        });

        describe("multiple values", () => {
          it("should filter the list on a single pre-indexed column", () => {
            return db
              .list({ filters: { id: [5, 4] } })
              .should.eventually.eql([
                { id: 4, name: "#4" },
                { id: 5, name: "#5" },
              ]);
          });

          it("should handle non-existent keys", () => {
            return db
              .list({ filters: { id: [4, 9999] } })
              .should.eventually.eql([{ id: 4, name: "#4" }]);
          });
        });
      });
    });
  });

  /** @test {IDB#loadDump} */
  describe("#loadDump", () => {
    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").returns({
        store: { add() {} },
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({ target: { error: "transaction error" } });
          },
        },
      });
      return db
        .loadDump([{ foo: "bar" }])
        .should.be.rejectedWith(Error, /^loadDump()/);
    });
  });

  describe("#getLastModified", () => {
    it("should reject with any encountered transaction error", () => {
      sandbox.stub(db, "prepare").returns({
        store: { get() {} },
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({ target: { error: "transaction error" } });
          },
        },
      });

      return db.getLastModified().should.be.rejectedWith(/transaction error/);
    });
  });

  describe("#saveLastModified", () => {
    it("should resolve with lastModified value", () => {
      return db.saveLastModified(42).should.eventually.become(42);
    });

    it("should save a lastModified value", () => {
      return db
        .saveLastModified(42)
        .then(_ => db.getLastModified())
        .should.eventually.become(42);
    });

    it("should allow updating previous value", () => {
      return db
        .saveLastModified(42)
        .then(_ => db.saveLastModified(43))
        .then(_ => db.getLastModified())
        .should.eventually.become(43);
    });

    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").returns({
        store: {
          put() {
            return {};
          },
        },
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({ target: { error: "transaction error" } });
          },
        },
      });
      return db.saveLastModified().should.be.rejectedWith(/transaction error/);
    });
  });

  describe("#loadDump", () => {
    it("should import a list of records.", () => {
      return db
        .loadDump([{ id: 1, foo: "bar" }, { id: 2, foo: "baz" }])
        .should.eventually.have.length(2);
    });

    it("should override existing records.", () => {
      return db
        .loadDump([{ id: 1, foo: "bar" }, { id: 2, foo: "baz" }])
        .then(() => {
          return db.loadDump([{ id: 1, foo: "baz" }, { id: 3, foo: "bab" }]);
        })
        .then(() => db.list())
        .should.eventually.eql([
          { id: 1, foo: "baz" },
          { id: 2, foo: "baz" },
          { id: 3, foo: "bab" },
        ]);
    });

    it("should update the collection lastModified value.", () => {
      return db
        .loadDump([
          { id: uuid4(), title: "foo", last_modified: 1457896541 },
          { id: uuid4(), title: "bar", last_modified: 1458796542 },
        ])
        .then(() => db.getLastModified())
        .should.eventually.become(1458796542);
    });

    it("should preserve older collection lastModified value.", () => {
      return db
        .saveLastModified(1458796543)
        .then(() =>
          db.loadDump([
            { id: uuid4(), title: "foo", last_modified: 1457896541 },
            { id: uuid4(), title: "bar", last_modified: 1458796542 },
          ]))
        .then(() => db.getLastModified())
        .should.eventually.become(1458796543);
    });
  });
});
