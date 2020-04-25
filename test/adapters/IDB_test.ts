import sinon from "sinon";

import IDB, { open, execute } from "../../src/adapters/IDB";
import { v4 as uuid4 } from "uuid";
import { StorageProxy } from "../../src/adapters/base";
import { KintoIdObject } from "kinto-http";
import { expectAsyncError } from "../test_utils";

const { expect } = intern.getPlugin("chai");
intern.getPlugin("chai").should();
const { describe, it, before, beforeEach, after, afterEach } = intern.getPlugin(
  "interface.bdd"
);

/** @test {IDB} */
describe("adapter.IDB", () => {
  let sandbox: sinon.SinonSandbox, db: IDB<any>;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    db = new IDB("test/foo");
    return db.clear();
  });

  afterEach(() => sandbox.restore());

  /** @test {IDB#open} */
  describe("#open", () => {
    it("should be fullfilled when a connection is opened", async () => {
      await db.open();
    });

    it("should reject on open request error", async () => {
      const fakeOpenRequest = {} as IDBOpenDBRequest;
      sandbox.stub(indexedDB, "open").returns(fakeOpenRequest);
      const db = new IDB("another/db");
      const prom = db.open();

      fakeOpenRequest.onerror!({ target: { error: new Error("fail") } } as any);

      await expectAsyncError(() => prom, "fail");
    });
  });

  /** @test {IDB#close} */
  describe("#close", () => {
    it("should be fullfilled when a connection is closed", async () => {
      await db.close();
    });

    it("should be fullfilled when no connection has been opened", async () => {
      db["_db"] = null;
      await db.close();
    });

    it("should close an opened connection to the database", async () => {
      await db.close();
      expect(db["_db"]).to.equal(null);
    });
  });

  /** @test {IDB#clear} */
  describe("#clear", () => {
    it("should clear the database", async () => {
      await db.execute((transaction) => {
        transaction.create({ id: "1" });
        transaction.create({ id: "2" });
      });
      await db.clear();
      const list = await db.list();
      list.should.have.lengthOf(0);
    });

    it("should isolate records by collection", async () => {
      const db1 = new IDB("main/tippytop");
      const db2 = new IDB("main/tippytop-2");

      await db1.open();
      await db1.execute((t) => t.create({ id: "1" }));
      await db1.saveLastModified(42);
      await db1.close();

      await db2.open();
      await db2.execute((t) => t.create({ id: "1" }));
      await db2.execute((t) => t.create({ id: "2" }));
      await db2.saveLastModified(43);
      await db2.close();

      await db1.clear();

      expect(await db1.list()).to.have.length(0);
      expect(await db1.getLastModified()).to.equal(42);
      expect(await db2.list()).to.have.length(2);
      expect(await db2.getLastModified()).to.equal(43);
    });

    it("should reject on transaction error", async () => {
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        callback({
          index() {
            return {
              openKeyCursor() {
                throw new Error("transaction error");
              },
            };
          },
        } as any);
      });

      await expectAsyncError(() => db.clear(), /transaction error/);
    });
  });

  /** @test {IDB#execute} */
  describe("#execute", () => {
    it("should return a promise", async () => {
      await db.execute(() => {});
    });

    describe("No preloading", () => {
      it("should open a connection to the db", async () => {
        const open = sandbox
          .stub(db, "open")
          .returns(Promise.resolve({} as IDB<any>));

        await db.execute(() => {});
        return sinon.assert.calledOnce(open);
      });

      it("should execute the specified callback", async () => {
        const callback = sandbox.spy();
        await db.execute(callback);
        return sinon.assert.called(callback);
      });

      it("should fail if the callback returns a promise", async () => {
        const callback = () => Promise.resolve();
        await expectAsyncError(() => db.execute(callback), /Promise/);
      });

      it("should rollback if the callback fails", async () => {
        const callback = (transaction: any) => {
          transaction.execute((t: StorageProxy<any>) =>
            t.create({ id: "1", foo: "bar" })
          );
          throw new Error("Unexpected");
        };

        try {
          await db.execute(callback);
        } catch (e) {}

        expect(await db.list()).to.deep.equal([]);
      });

      it("should provide a transaction parameter", async () => {
        const callback = sandbox.spy();
        await db.execute(callback);
        const handler = callback.getCall(0).args[0];
        expect(handler).to.have.property("get").to.be.a("function");
        expect(handler).to.have.property("create").to.be.a("function");
        expect(handler).to.have.property("update").to.be.a("function");
        expect(handler).to.have.property("delete").to.be.a("function");
      });

      it("should create a record", async () => {
        const data = { id: "1", foo: "bar" };
        await db.execute((t) => t.create(data));
        const list = await db.list();
        list.should.deep.equal([data]);
      });

      it("should update a record", async () => {
        const data = { id: "1", foo: "bar" };
        await db.execute((t) => t.create(data));
        await db.execute((t) => {
          t.update({ ...data, foo: "baz" });
        });
        const res = await db.get(data.id);
        res!.foo.should.equal("baz");
      });

      it("should delete a record", async () => {
        const data = { id: "1", foo: "bar" };
        await db.execute((t) => t.create(data));
        await db.execute((transaction) => {
          transaction.delete(data.id);
        });
        const id = await db.get(data.id);
        expect(id).to.equal(undefined);
      });

      it("should reject on store method error", async () => {
        sandbox
          .stub(db, "prepare")
          .callsFake(async (name, callback, options) => {
            const abort = (e: Error) => {
              throw e;
            };
            callback(
              {
                openCursor: () => ({
                  set onsuccess(cb: (arg0: { target: {} }) => void) {
                    cb({ target: {} });
                  },
                }),
                add() {
                  throw new Error("add error");
                },
              } as any,
              abort
            );
          });

        await expectAsyncError(
          () => db.execute((transaction) => transaction.create({ id: "42" })),
          "add error"
        );
      });

      it("should reject on transaction error", async () => {
        sandbox
          .stub(db, "prepare")
          .callsFake(async (name, callback, options) => {
            return callback({
              openCursor() {
                throw new Error("transaction error");
              },
            } as any);
          });

        await expectAsyncError(
          () =>
            db.execute((transaction) => transaction.create({} as any), {
              preload: ["1", "2"],
            }),
          "transaction error"
        );
      });
    });

    describe("Preloaded records", () => {
      const articles: KintoIdObject[] = [];
      for (let i = 0; i < 100; i++) {
        articles.push({ id: `${i}`, title: `title${i}` });
      }
      const preload: string[] = [];
      for (let i = 0; i < 10; i++) {
        preload.push(articles[Math.floor(Math.random() * articles.length)].id);
      }

      it("should expose preloaded records using get()", async () => {
        await db.execute((t) => articles.map((a) => t.create(a)));
        const preloaded = await db.execute(
          (transaction) => {
            return preload.map((p) => transaction.get(p));
          },
          { preload }
        );
        preloaded.forEach((p, i) => {
          expect(p.title).eql(articles[parseInt(preload[i], 10)].title);
        });
      });
    });
  });

  /** @test {IDB#get} */
  describe("#get", () => {
    beforeEach(() => {
      return db.execute((t) => t.create({ id: "1", foo: "bar" }));
    });

    it("should retrieve a record from its id", async () => {
      const res = await db.get("1");
      res!.foo.should.equal("bar");
    });

    it("should return undefined when record is not found", async () => {
      const res = await db.get("999");
      expect(res).to.equal(undefined);
    });

    it("should reject on transaction error", async () => {
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        return callback({
          get() {
            throw new Error("transaction error");
          },
        } as any);
      });

      await expectAsyncError(
        () => db.get(undefined as any),
        /transaction error/
      );
    });
  });

  /** @test {IDB#list} */
  describe("#list", () => {
    beforeEach(() => {
      return db.execute((transaction) => {
        for (let id = 1; id <= 10; id++) {
          // id is indexed, name is not
          transaction.create({ id: id.toString(), name: "#" + id });
        }
      });
    });

    it("should retrieve the list of records", async () => {
      const list = await db.list();
      list.should.have.lengthOf(10);
    });

    it("should prefix error encountered", async () => {
      sandbox.stub(db, "open").returns(Promise.reject("error"));
      await expectAsyncError(
        () => db.list(),
        /^IndexedDB list()/,
        IDB.IDBError
      );
    });

    it("should reject on transaction error", async () => {
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        return callback({
          index() {
            return {
              getAll() {
                throw new Error("transaction error");
              },
            };
          },
        } as any);
      });

      await expectAsyncError(
        () => db.list(),
        "IndexedDB list() transaction error",
        IDB.IDBError
      );
    });

    it("should isolate records by collection", async () => {
      const db1 = new IDB("main/tippytop");
      const db2 = new IDB("main/tippytop-2");
      await db1.clear();
      await db2.clear();

      await db1.open();
      await db2.open();
      await db1.execute((t) => t.create({ id: "1" }));
      await db2.execute((t) => t.create({ id: "1" }));
      await db2.execute((t) => t.create({ id: "2" }));
      await db1.close();
      await db2.close();

      expect(await db1.list()).to.have.length(1);
      expect(await db2.list()).to.have.length(2);
    });

    describe("Filters", () => {
      describe("on non-indexed fields", () => {
        describe("single value", () => {
          it("should filter the list on a single pre-indexed column", async () => {
            const list = await db.list({ filters: { name: "#4" } });
            list.should.deep.equal([{ id: "4", name: "#4" }]);
          });
        });

        describe("multiple values", () => {
          it("should filter the list on a single pre-indexed column", async () => {
            const list = await db.list({ filters: { name: ["#4", "#5"] } });
            list.should.deep.equal([
              { id: "4", name: "#4" },
              { id: "5", name: "#5" },
            ]);
          });

          it("should handle non-existent keys", async () => {
            const list = await db.list({ filters: { name: ["#4", "qux"] } });
            list.should.deep.equal([{ id: "4", name: "#4" }]);
          });

          it("should handle empty lists", async () => {
            const list = await db.list({ filters: { name: [] } });
            list.should.deep.equal([]);
          });
        });
      });

      describe("on indexed fields", () => {
        describe("single value", () => {
          it("should filter the list on a single pre-indexed column", async () => {
            const list = await db.list({ filters: { id: "4" } });
            list.should.deep.equal([{ id: "4", name: "#4" }]);
          });
        });

        describe("multiple values", () => {
          it("should filter the list on a single pre-indexed column", async () => {
            const list = await db.list({ filters: { id: ["5", "4"] } });
            list.should.deep.equal([
              { id: "4", name: "#4" },
              { id: "5", name: "#5" },
            ]);
          });

          it("should filter the list combined with other filters", async () => {
            const list = await db.list({
              filters: { id: ["5", "4"], name: "#4" },
            });
            list.should.deep.equal([{ id: "4", name: "#4" }]);
          });

          it("should handle non-existent keys", async () => {
            const list = await db.list({ filters: { id: ["4", "9999"] } });
            list.should.deep.equal([{ id: "4", name: "#4" }]);
          });

          it("should handle empty lists", async () => {
            const list = await db.list({ filters: { id: [] } });
            list.should.deep.equal([]);
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
    it("should call importBulk", async () => {
      const importBulkStub = sandbox
        .stub(db, "importBulk")
        .returns(Promise.resolve([]));
      await db.loadDump([{ id: "1", last_modified: 0, foo: "bar" }]);
      return sinon.assert.calledOnce(importBulkStub);
    });
  });

  /** @test {IDB#getLastModified} */
  describe("#getLastModified", () => {
    it("should reject with any encountered transaction error", async () => {
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        return callback({
          get() {
            throw new Error("transaction error");
          },
        } as any);
      });

      await expectAsyncError(() => db.getLastModified(), /transaction error/);
    });
  });

  /** @test {IDB#saveLastModified} */
  describe("#saveLastModified", () => {
    it("should resolve with lastModified value", async () => {
      const res = await db.saveLastModified(42);
      res.should.equal(42);
    });

    it("should save a lastModified value", async () => {
      await db.saveLastModified(42);
      const res = await db.getLastModified();
      res.should.equal(42);
    });

    it("should allow updating previous value", async () => {
      await db.saveLastModified(42);
      await db.saveLastModified(43);
      const res = await db.getLastModified();
      res.should.equal(43);
    });

    it("should reject on transaction error", async () => {
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        return callback({
          delete() {
            throw new Error("transaction error");
          },
        } as any);
      });

      await expectAsyncError(
        () => db.saveLastModified(undefined as any),
        /transaction error/
      );
    });
  });

  /** @test {IDB#importBulk} */
  describe("#importBulk", () => {
    it("should import a list of records.", async () => {
      const res = await db.importBulk([
        { id: "1", foo: "bar", last_modified: 0 },
        { id: "2", foo: "baz", last_modified: 1 },
      ]);
      res.should.have.lengthOf(2);
    });

    it("should override existing records.", async () => {
      await db.importBulk([
        { id: "1", foo: "bar", last_modified: 0 },
        { id: "2", foo: "baz", last_modified: 1 },
      ]);
      await db.importBulk([
        { id: "1", foo: "baz", last_modified: 2 },
        { id: "3", foo: "bab", last_modified: 2 },
      ]);
      const list = await db.list();
      list.should.deep.equal([
        { id: "1", foo: "baz", last_modified: 2 },
        { id: "2", foo: "baz", last_modified: 1 },
        { id: "3", foo: "bab", last_modified: 2 },
      ]);
    });

    it("should update the collection lastModified value.", async () => {
      await db.importBulk([
        { id: uuid4(), title: "foo", last_modified: 1457896541 },
        { id: uuid4(), title: "bar", last_modified: 1458796542 },
      ]);
      const lastModified = await db.getLastModified();
      lastModified.should.equal(1458796542);
    });

    it("should preserve older collection lastModified value.", async () => {
      await db.saveLastModified(1458796543);
      await db.importBulk([
        { id: uuid4(), title: "foo", last_modified: 1457896541 },
        { id: uuid4(), title: "bar", last_modified: 1458796542 },
      ]);
      const lastModified = await db.getLastModified();
      lastModified.should.equal(1458796543);
    });

    it("should reject on transaction error", async () => {
      sandbox.stub(db, "prepare").callsFake(async (name, callback, options) => {
        return callback({
          put() {
            throw new Error("transaction error");
          },
        } as any);
      });

      await expectAsyncError(
        () => db.importBulk([{ id: "1", last_modified: 0, foo: "bar" }]),
        /^IndexedDB importBulk()/,
        IDB.IDBError
      );
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
      await db1.execute((t) => t.create({ id: "1" }));
      await db2.execute((t) => t.create({ id: "1" }));
      await db2.execute((t) => t.create({ id: "2" }));
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
    it("should return null when no metadata is found", async () => {
      const metadata = await db.getMetadata();
      expect(metadata).to.equal(null);
    });

    it("should store metadata in db", async () => {
      await db.saveMetadata({ id: "abc", schema: { type: "object" } });

      const retrieved = await db.getMetadata();
      expect(retrieved.id, "abc");
    });
  });

  /** @test {IDB#open} */
  describe("#migration", () => {
    let idb: IDB<any>;
    async function createOldDB(dbName: string) {
      const oldDb = await open(dbName, {
        version: 1,
        onupgradeneeded: (event: IDBVersionChangeEvent) => {
          // https://github.com/Kinto/kinto.js/blob/v11.2.2/src/adapters/IDB.js#L154-L171
          const db = (event.target as IDBRequest<IDBDatabase>).result;
          db.createObjectStore(dbName, { keyPath: "id" });
          db.createObjectStore("__meta__", { keyPath: "name" });
        },
      });
      await execute(
        oldDb,
        dbName,
        (store) => {
          store.put({ id: "1" });
          store.put({ id: "2" });
        },
        { mode: "readwrite" }
      );
      await execute(
        oldDb,
        "__meta__",
        (store) => {
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
      const list = await idb.list();
      list.should.deep.equal([{ id: "1" }, { id: "2" }]);
    });

    it("should migrate timestamps", async () => {
      const lastModified = await idb.getLastModified();
      lastModified.should.equal(43);
    });

    it("should create the collections store", async () => {
      const metadata = { id: "abc" };
      await idb.saveMetadata(metadata);
      (await idb.getMetadata()).should.deep.equal(metadata);
    });

    it("should not fail if already migrated", async () => {
      await idb.close();
      await idb.open();
      await idb.close();
      await idb.open();
    });

    it("should delete the old database", async () => {
      await expectAsyncError(() =>
        open(cid, {
          version: 1,
          onupgradeneeded: (event) =>
            (event.target as IDBRequest<IDBDatabase>).transaction!.abort(),
        })
      );
    });

    it("should not delete other databases", async () => {
      await open("another/not-migrated", {
        version: 1,
        onupgradeneeded: (event) =>
          (event.target as IDBRequest<IDBDatabase>).transaction!.abort(),
      });
    });

    it("should not migrate if option is set to false", async () => {
      const idb = new IDB("another/not-migrated", { migrateOldData: false });
      const list = await idb.list();
      list.should.deep.equal([]);
    });

    it("should not fail if old database is broken or incomplete", async () => {
      const oldDb = await open("some/db", {
        version: 1,
        onupgradeneeded: (event) => {},
      });
      oldDb.close();
      const idb = new IDB("some/db", { migrateOldData: true });
      await idb.open();
    });
  });
});
