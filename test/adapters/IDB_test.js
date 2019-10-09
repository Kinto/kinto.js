"use strict";

import sinon from "sinon";
import { expect } from "chai";

import IDB, { open, execute } from "../../src/adapters/IDB.js";
import { default as uuid4 } from "uuid/v4";

/** @test {IDB} */
describe("adapter.IDB", () => {
  let sandbox, db;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
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
      return db
        .close()
        .then(_ => db._db)
        .should.become(null);
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

    it("should isolate records by collection", async () => {
      const db1 = new IDB("main/tippytop");
      const db2 = new IDB("main/tippytop-2");

      await db1.open();
      await db1.execute(t => t.create({ id: 1 }));
      await db1.saveLastModified(42);
      await db1.close();

      await db2.open();
      await db2.execute(t => t.create({ id: 1 }));
      await db2.execute(t => t.create({ id: 2 }));
      await db1.saveLastModified(43);
      await db2.close();

      await db1.clear();

      expect(await db1.list()).to.have.length(0);
      expect(await db1.getLastModified(), null);
      expect(await db2.list()).to.have.length(2);
      expect(await db2.getLastModified(), 43);
    });

    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        callback({
          index() {
            return {
              openKeyCursor() {
                throw new Error("transaction error");
              },
            };
          },
        });
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
        return db
          .execute(callback)
          .catch(() => db.list())
          .should.become([]);
      });

      it("should provide a transaction parameter", () => {
        const callback = sandbox.spy();
        return db.execute(callback).then(() => {
          const handler = callback.getCall(0).args[0];
          expect(handler)
            .to.have.property("get")
            .to.be.a("function");
          expect(handler)
            .to.have.property("create")
            .to.be.a("function");
          expect(handler)
            .to.have.property("update")
            .to.be.a("function");
          expect(handler)
            .to.have.property("delete")
            .to.be.a("function");
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
        sandbox
          .stub(db, "prepare")
          .callsFake(async (name, callback, options) => {
            const abort = e => {
              throw e;
            };
            callback(
              {
                openCursor: () => ({
                  set onsuccess(cb) {
                    cb({ target: {} });
                  },
                }),
                add() {
                  throw new Error("add error");
                },
              },
              abort
            );
          });
        return db
          .execute(transaction => transaction.create({ id: 42 }))
          .should.be.rejectedWith(Error, "add error");
      });

      it("should reject on transaction error", () => {
        sandbox
          .stub(db, "prepare")
          .callsFake(async (name, callback, options) => {
            return callback({
              openCursor() {
                throw new Error("transaction error");
              },
            });
          });
        return db
          .execute(transaction => transaction.create({}), { preload: [1, 2] })
          .should.be.rejectedWith(Error, "transaction error");
      });
    });

    describe("Preloaded records", () => {
      const articles = [];
      for (let i = 0; i < 100; i++) {
        articles.push({ id: `${i}`, title: `title${i}` });
      }
      const preload = [];
      for (let i = 0; i < 10; i++) {
        preload.push(articles[Math.floor(Math.random() * articles.length)].id);
      }

      it("should expose preloaded records using get()", () => {
        return db
          .execute(t => articles.map(a => t.create(a)))
          .then(_ => {
            return db.execute(
              transaction => {
                return preload.map(p => transaction.get(p));
              },
              { preload }
            );
          })
          .then(preloaded => {
            preloaded.forEach((p, i) => {
              expect(p.title).eql(articles[preload[i]].title);
            });
          });
      });
    });
  });

  /** @test {IDB#get} */
  describe("#get", () => {
    beforeEach(() => {
      return db.execute(t => t.create({ id: 1, foo: "bar" }));
    });

    it("should retrieve a record from its id", () => {
      return db
        .get(1)
        .then(res => res.foo)
        .should.eventually.eql("bar");
    });

    it("should return undefined when record is not found", () => {
      return db.get(999).should.eventually.eql(undefined);
    });

    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        return callback({
          get() {
            throw new Error("transaction error");
          },
        });
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
      return db.list().should.be.rejectedWith(Error, /^IndexedDB list()/);
    });

    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        return callback({
          index() {
            return {
              getAll() {
                throw new Error("transaction error");
              },
            };
          },
        });
      });
      return db
        .list()
        .should.be.rejectedWith(Error, "IndexedDB list() transaction error");
    });

    it("should isolate records by collection", async () => {
      const db1 = new IDB("main/tippytop");
      const db2 = new IDB("main/tippytop-2");
      await db1.clear();
      await db2.clear();

      await db1.open();
      await db2.open();
      await db1.execute(t => t.create({ id: 1 }));
      await db2.execute(t => t.create({ id: 1 }));
      await db2.execute(t => t.create({ id: 2 }));
      await db1.close();
      await db2.close();

      expect(await db1.list()).to.have.length(1);
      expect(await db2.list()).to.have.length(2);
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

          it("should handle empty lists", () => {
            return db.list({ filters: { name: [] } }).should.eventually.eql([]);
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

          it("should filter the list combined with other filters", () => {
            return db
              .list({ filters: { id: [5, 4], name: "#4" } })
              .should.eventually.eql([{ id: 4, name: "#4" }]);
          });

          it("should handle non-existent keys", () => {
            return db
              .list({ filters: { id: [4, 9999] } })
              .should.eventually.eql([{ id: 4, name: "#4" }]);
          });

          it("should handle empty lists", () => {
            return db.list({ filters: { id: [] } }).should.eventually.eql([]);
          });
        });
      });
    });
  });

  /**
   * @deprecated
   * @test {IDB#loadDump}
   */
  describe("Deprecated #loadDump", () => {
    it("should call importBulk", () => {
      sandbox.stub(db, "importBulk").returns(Promise.resolve());
      return db
        .loadDump([{ foo: "bar" }])
        .then(_ => sinon.assert.calledOnce(db.importBulk));
    });
  });

  /** @test {IDB#importBulk} */
  describe("#importBulk", () => {
    it("should reject on transaction error", () => {
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        return callback({
          put() {
            throw new Error("transaction error");
          },
        });
      });
      return db
        .importBulk([{ foo: "bar" }])
        .should.be.rejectedWith(Error, /^IndexedDB importBulk()/);
    });
  });

  /** @test {IDB#getLastModified} */
  describe("#getLastModified", () => {
    it("should reject with any encountered transaction error", () => {
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        return callback({
          get() {
            throw new Error("transaction error");
          },
        });
      });
      return db.getLastModified().should.be.rejectedWith(/transaction error/);
    });
  });

  /** @test {IDB#saveLastModified} */
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
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        return callback({
          delete() {
            throw new Error("transaction error");
          },
        });
      });
      return db.saveLastModified().should.be.rejectedWith(/transaction error/);
    });
  });

  /** @test {IDB#importBulk} */
  describe("#importBulk", () => {
    it("should import a list of records.", () => {
      return db
        .importBulk([{ id: 1, foo: "bar" }, { id: 2, foo: "baz" }])
        .should.eventually.have.length(2);
    });

    it("should override existing records.", () => {
      return db
        .importBulk([{ id: 1, foo: "bar" }, { id: 2, foo: "baz" }])
        .then(() => {
          return db.importBulk([{ id: 1, foo: "baz" }, { id: 3, foo: "bab" }]);
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
        .importBulk([
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
          db.importBulk([
            { id: uuid4(), title: "foo", last_modified: 1457896541 },
            { id: uuid4(), title: "bar", last_modified: 1458796542 },
          ])
        )
        .then(() => db.getLastModified())
        .should.eventually.become(1458796543);
    });
  });

  /** @test {IDB#list} */
  /** @test {IDB#getLastModified} */
  describe("With custom dbName", () => {
    it("should isolate records by dbname", async () => {
      const db1 = new IDB("main/tippytop", { dbName: "KintoDB" });
      const db2 = new IDB("main/tippytop", { dbName: "RemoteSettings" });
      await db1.clear();
      await db2.clear();

      await db1.open();
      await db2.open();
      await db1.execute(t => t.create({ id: 1 }));
      await db2.execute(t => t.create({ id: 1 }));
      await db2.execute(t => t.create({ id: 2 }));
      await db1.close();
      await db2.close();

      expect(await db1.list()).to.have.length(1);
      expect(await db2.list()).to.have.length(2);
    });

    it("should isolate timestamps by dbname", async () => {
      const db1 = new IDB("main/tippytop", { dbName: "KintoDB" });
      const db2 = new IDB("main/tippytop", { dbName: "RemoteSettings" });

      await db1.open();
      await db2.open();
      await db1.saveLastModified(41);
      await db2.saveLastModified(42);
      await db1.close();
      await db2.close();

      expect(await db1.getLastModified()).to.be.equal(41);
      expect(await db2.getLastModified()).to.be.equal(42);
    });
  });

  /** @test {IDB#saveMetadata} */
  describe("#saveMetadata", () => {
    it("should return null when no metadata is found", () => {
      return db.getMetadata().should.eventually.eql(null);
    });

    it("should store metadata in db", async () => {
      await db.saveMetadata({ id: "abc", schema: { type: "object" } });

      const retrieved = await db.getMetadata();
      expect(retrieved.id, "abc");
    });
  });

  /** @test {IDB#open} */
  describe("#migration", () => {
    let idb;
    async function createOldDB(dbName) {
      const oldDb = await open(dbName, {
        version: 1,
        onupgradeneeded: event => {
          // https://github.com/Kinto/kinto.js/blob/v11.2.2/src/adapters/IDB.js#L154-L171
          const db = event.target.result;
          db.createObjectStore(dbName, { keyPath: "id" });
          db.createObjectStore("__meta__", { keyPath: "name" });
        },
      });
      await execute(
        oldDb,
        dbName,
        store => {
          store.put({ id: 1 });
          store.put({ id: 2 });
        },
        { mode: "readwrite" }
      );
      await execute(
        oldDb,
        "__meta__",
        store => {
          store.put({ name: "lastModified", value: 43 });
        },
        { mode: "readwrite" }
      );
      oldDb.close(); // synchronous.
    }

    const cid = "main/tippytop";

    before(async () => {
      await createOldDB(cid);
      await createOldDB("another/not-migrated");

      idb = new IDB(cid, {
        migrateOldData: true,
      });
    });

    after(() => {
      return idb.close();
    });

    it("should migrate records", async () => {
      return idb.list().should.eventually.become([{ id: 1 }, { id: 2 }]);
    });

    it("should migrate timestamps", () => {
      return idb.getLastModified().should.eventually.become(43);
    });

    it("should create the collections store", async () => {
      const metadata = { id: "abc" };
      await idb.saveMetadata(metadata);
      return idb.getMetadata().should.eventually.become(metadata);
    });

    it("should not fail if already migrated", () => {
      return idb
        .close()
        .then(() => idb.open())
        .then(() => idb.close())
        .then(() => idb.open()).should.be.fulfilled;
    });

    it("should delete the old database", () => {
      return open(cid, {
        version: 1,
        onupgradeneeded: event => event.target.transaction.abort(),
      }).should.eventually.be.rejected;
    });

    it("should not delete other databases", () => {
      return open("another/not-migrated", {
        version: 1,
        onupgradeneeded: event => event.target.transaction.abort(),
      }).should.eventually.be.fulfilled;
    });

    it("should not migrate if option is set to false", () => {
      const idb = new IDB("another/not-migrated", { migrateOldData: false });
      return idb.list().should.eventually.become([]);
    });

    it("should not fail if old database is broken or incomplete", async () => {
      const oldDb = await open("some/db", {
        version: 1,
        onupgradeneeded: event => {},
      });
      oldDb.close();
      const idb = new IDB("some/db", { migrateOldData: true });
      return idb.open().should.eventually.be.fulfilled;
    });
  });
});
