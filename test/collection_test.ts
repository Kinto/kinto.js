/* eslint dot-notation: off */
import sinon from "sinon";
import { EventEmitter } from "events";
import { v4 as uuid4 } from "uuid";

import IDB from "../src/adapters/IDB";
import Memory from "../src/adapters/memory";
import BaseAdapter from "../src/adapters/base";
import Collection, { SyncResultObject } from "../src/collection";
import { Hooks, IdSchema, RemoteTransformer, KintoError } from "../src/types";
import Api, {
  KintoObject,
  KintoIdObject,
  Collection as KintoClientCollection,
} from "../src/http";
import { recordsEqual } from "../src/collection";
import {
  updateTitleWithDelay,
  fakeServerResponse,
  expectAsyncError,
} from "./test_utils";
import { createKeyValueStoreIdSchema } from "../src/collection";
import KintoBase from "../src/KintoBase";

const { expect } = intern.getPlugin("chai");
intern.getPlugin("chai").should();
const { describe, it, beforeEach, afterEach } =
  intern.getPlugin("interface.bdd");

const TEST_BUCKET_NAME = "kinto-test";
const TEST_COLLECTION_NAME = "kinto-test";
const FAKE_SERVER_URL = "http://fake-server/v1";
const NULL_SCHEMA = {
  generate() {},
  validate() {
    return true;
  },
};

/** @test {Collection} */
describe("Collection", () => {
  function runSuite(
    label: string,
    adapter: (
      dbName: string,
      options?: {
        dbName?: string;
        migrateOldData?: boolean;
      }
    ) => BaseAdapter<any>
  ) {
    describe(label, () => {
      /*eslint-disable */
      let sandbox: sinon.SinonSandbox, events: EventEmitter, api: Api;
      /*eslint-enable */
      const article = { title: "foo", url: "http://foo" };

      function testCollection(options: any = {}) {
        events = new EventEmitter();
        const opts = { adapter, events, ...options };
        api = new Api(FAKE_SERVER_URL, { events });
        return new Collection(
          TEST_BUCKET_NAME,
          TEST_COLLECTION_NAME,
          { api } as unknown as KintoBase<any>,
          opts
        );
      }

      function createEncodeTransformer(char: string, delay: number) {
        return {
          encode(record: any) {
            return updateTitleWithDelay(record, char, delay);
          },
          decode(record: any) {},
        };
      }

      function createIntegerIdSchema() {
        let _next = 0;
        return {
          generate() {
            return _next++;
          },
          validate(id: any) {
            return id === parseInt(id, 10) && id >= 0;
          },
        };
      }

      function createKeyListIdSchema() {
        return {
          generate(record: any) {
            return Object.keys(record).sort().join(",");
          },
          validate(id: string) {
            return id !== "";
          },
        };
      }

      beforeEach(() => {
        sandbox = sinon.createSandbox();
        return testCollection().clear();
      });

      afterEach(() => {
        sandbox.restore();
      });

      describe("Helpers", () => {
        /** @test {recordsEqual} */
        describe("#recordsEqual", () => {
          it("should compare record data without metadata", () => {
            expect(
              recordsEqual(
                { title: "foo", _status: "foo", last_modified: 32 },
                { title: "foo" }
              )
            ).equal(true);
          });

          it("should compare record data without metadata nor local fields", () => {
            expect(
              recordsEqual(
                { title: "foo", _status: "foo", size: 32 },
                { title: "foo" },
                ["size"]
              )
            ).equal(true);
          });
        });
      });

      /** @test {Collection#constructor} */
      describe("#constructor", () => {
        it("should expose a passed events instance", () => {
          const events = new EventEmitter();
          const api = new Api(FAKE_SERVER_URL, { events });
          const collection = new Collection(
            TEST_BUCKET_NAME,
            TEST_COLLECTION_NAME,
            { api } as unknown as KintoBase<any>,
            { events }
          );
          expect(collection.events).to.equal(events);
        });

        it("should propagate its events property to child dependencies", () => {
          const events = new EventEmitter();
          const api = new Api(FAKE_SERVER_URL, { events });
          const collection = new Collection(
            TEST_BUCKET_NAME,
            TEST_COLLECTION_NAME,
            { api } as unknown as KintoBase<any>,
            { events }
          );
          expect(collection.api.events).equal(collection.events);
          expect(collection.api.http.events).equal(collection.events);
        });

        it("should allow providing a prefix for the db name", () => {
          const collection = new Collection(
            TEST_BUCKET_NAME,
            TEST_COLLECTION_NAME,
            { api } as unknown as KintoBase<any>,
            {
              adapterOptions: {
                dbName: "LocalData",
              },
            }
          );
          expect((collection.db as IDB<any>).dbName).equal("LocalData");
          expect((collection.db as IDB<any>).cid).equal(
            `${TEST_BUCKET_NAME}/${TEST_COLLECTION_NAME}`
          );
        });

        it("should use the default adapter if not any is provided", () => {
          const events = new EventEmitter();
          const api = new Api(FAKE_SERVER_URL, { events });
          const hooks = {};
          const collection = new Collection(
            TEST_BUCKET_NAME,
            TEST_COLLECTION_NAME,
            { api } as unknown as KintoBase<any>,
            { hooks }
          );
          expect(collection.db).to.be.an.instanceof(IDB);
        });

        it("should throw incompatible adapter options", () => {
          const events = new EventEmitter();
          const api = new Api(FAKE_SERVER_URL, { events });
          expect(() => {
            new Collection(
              TEST_BUCKET_NAME,
              TEST_COLLECTION_NAME,
              { api } as unknown as KintoBase<any>,
              {
                adapter() {},
              } as any
            );
          }).to.Throw(Error, /Unsupported adapter/);
        });

        it("should allow providing an adapter option", () => {
          const MyAdapter = class extends BaseAdapter<any> {};
          const collection = new Collection(
            TEST_BUCKET_NAME,
            TEST_COLLECTION_NAME,
            { api } as unknown as KintoBase<any>,
            {
              adapter: () => new MyAdapter(),
            }
          );
          expect(collection.db).to.be.an.instanceOf(MyAdapter);
        });

        it("should pass adapterOptions to adapter", () => {
          let myOptions;
          const MyAdapter = class extends BaseAdapter<any> {
            constructor(collectionName: string, options: any) {
              super();
              myOptions = options;
            }
          };
          new Collection(
            TEST_BUCKET_NAME,
            TEST_COLLECTION_NAME,
            { api } as unknown as KintoBase<any>,
            {
              adapter: (collectionName: string, options: any) =>
                new MyAdapter(collectionName, options),
              adapterOptions: "my options" as any,
            }
          );
          expect(myOptions).equal("my options");
        });

        describe("transformers registration", () => {
          function registerTransformers(transformers: RemoteTransformer[]) {
            new Collection(
              TEST_BUCKET_NAME,
              TEST_COLLECTION_NAME,
              { api } as unknown as KintoBase<any>,
              {
                remoteTransformers: transformers,
              }
            );
          }

          it("should throw an error on non-array remoteTransformers", () => {
            expect(registerTransformers.bind(null, {} as any)).to.Throw(
              Error,
              /remoteTransformers should be an array/
            );
          });

          it("should throw an error on non-object transformer", () => {
            expect(
              registerTransformers.bind(null, ["invalid" as any])
            ).to.Throw(Error, /transformer must be an object/);
          });

          it("should throw an error on encode method missing", () => {
            expect(
              registerTransformers.bind(null, [{ decode() {} } as any])
            ).to.Throw(Error, /transformer must provide an encode function/);
          });

          it("should throw an error on decode method missing", () => {
            expect(
              registerTransformers.bind(null, [{ encode() {} } as any])
            ).to.Throw(Error, /transformer must provide a decode function/);
          });
        });

        describe("hooks registration", () => {
          function registerHooks(hooks: Hooks) {
            return new Collection(
              TEST_BUCKET_NAME,
              TEST_COLLECTION_NAME,
              { api } as unknown as KintoBase<any>,
              {
                hooks,
              }
            );
          }

          it("should throw an error on non-object hooks", () => {
            expect(registerHooks.bind(null, function () {} as any)).to.Throw(
              Error,
              /hooks should be an object/
            );
          });

          it("should throw an error on array hooks", () => {
            expect(registerHooks.bind(null, [] as any)).to.Throw(
              Error,
              /hooks should be an object, not an array./
            );
          });

          it("should return a empty object if no hook where specified", () => {
            const collection = registerHooks({});
            expect(collection.hooks).to.deep.equal({});
          });

          it("should throw an error on unknown hook", () => {
            expect(
              registerHooks.bind(null, {
                invalid: [],
              } as any)
            ).to.Throw(Error, /The hook should be one of/);
          });

          it("should throw if the hook isn't a list", () => {
            expect(
              registerHooks.bind(null, {
                "incoming-changes": {} as any,
              })
            ).to.Throw(
              Error,
              /A hook definition should be an array of functions./
            );
          });

          it("should throw an error if the hook is not an array of functions", () => {
            expect(
              registerHooks.bind(null, {
                "incoming-changes": ["invalid"] as any,
              })
            ).to.Throw(
              Error,
              /A hook definition should be an array of functions./
            );
          });
        });

        describe("idSchema registration", () => {
          function registerIdSchema(idSchema: IdSchema) {
            new Collection(
              TEST_BUCKET_NAME,
              TEST_COLLECTION_NAME,
              { api } as unknown as KintoBase<any>,
              {
                idSchema,
              }
            );
          }

          it("should throw an error on non-object transformer", () => {
            expect(registerIdSchema.bind(null, "invalid" as any)).to.Throw(
              Error,
              /idSchema must be an object/
            );
          });

          it("should throw an error on generate method missing", () => {
            expect(
              registerIdSchema.bind(null, {
                validate() {},
              } as any)
            ).to.Throw(Error, /idSchema must provide a generate function/);
          });

          it("should throw an error on validate method missing", () => {
            expect(
              registerIdSchema.bind(null, {
                generate() {},
              } as any)
            ).to.Throw(Error, /idSchema must provide a validate function/);
          });
        });
      });

      /** @test {SyncResultObject} */
      describe("SyncResultObject", () => {
        it("should create a result object", () => {
          const r = new SyncResultObject();
          expect(r.lastModified).to.equal(null);
          [
            "errors",
            "created",
            "updated",
            "deleted",
            "published",
            "conflicts",
            "skipped",
          ].forEach((l) => expect((r as any)[l]).to.deep.equal([]));
        });

        describe("set lastModified", () => {
          it("should set lastModified", () => {
            const result = new SyncResultObject();

            result.lastModified = 42;

            expect(result.lastModified).equal(42);
          });
        });

        /** @test {SyncResultObject#add} */
        describe("#add", () => {
          it("should add typed entries", () => {
            const result = new SyncResultObject();

            result.add("skipped", [1, 2]);
            expect(result.skipped).eql([1, 2]);
          });

          it("should concat typed entries", () => {
            const result = new SyncResultObject();

            result.add("skipped", [1, 2]);
            expect(result.skipped).eql([1, 2]);

            result.add("skipped", [3]);
            expect(result.skipped).eql([1, 2, 3]);
          });

          it("should overwrite entries with same id", () => {
            const result = new SyncResultObject();

            result.add("skipped", [{ id: 1, name: "a" }]);
            result.add("skipped", [{ id: 2, name: "b" }]);
            result.add("skipped", [{ id: 1, name: "c" }]);
            result.add("skipped", [{ name: "d" }]);
            result.add("skipped", [{ name: "e" }]);
            expect(result.skipped).eql([
              { id: 1, name: "c" },
              { id: 2, name: "b" },
              { name: "d" },
              { name: "e" },
            ]);
          });

          it("should deduplicate added entries with same id", () => {
            const result = new SyncResultObject();

            result.add("created", [
              { id: 1, name: "a" },
              { id: 1, name: "b" },
            ]);
            expect(result.created).eql([{ id: 1, name: "b" }]);
          });

          it("should update the ok status flag on errors", () => {
            const result = new SyncResultObject();

            result.add("errors", [1 as any]);

            expect(result.ok).equal(false);
          });

          it("should update the ok status flag on conflicts", () => {
            const result = new SyncResultObject();

            result.add("conflicts", [1 as any]);

            expect(result.ok).equal(false);
          });

          it("should alter non-array properties", () => {
            const result = new SyncResultObject();

            result.add("ok" as any, false);

            expect(result.ok).equal(true);
          });

          it("should return the current result object", () => {
            const result = new SyncResultObject();

            expect(result.add("resolved", [])).equal(result);
          });

          it("should support adding single objects", () => {
            const result = new SyncResultObject();

            const e: KintoError = {
              type: "incoming",
              message: "conflict",
            };
            result.add("errors", e);
            expect(result.errors).eql([e]);
          });
        });

        /** @test {SyncResultObject#reset} */
        describe("#reset", () => {
          it("should reset to array prop to its default value", () => {
            const result = new SyncResultObject()
              .add("resolved", [1, 2, 3])!
              .reset("resolved");

            expect(result.resolved).eql([]);
          });

          it("should return the current result object", () => {
            const result = new SyncResultObject();

            expect(result.reset("resolved")).equal(result);
          });
        });
      });

      /** @test {Collection#clear} */
      describe("#clear", () => {
        let articles: Collection;

        beforeEach(() => {
          articles = testCollection();
          return Promise.all([
            articles.create({ title: "foo" }),
            articles.create({ title: "bar" }),
            articles.db.saveMetadata({ id: "articles", last_modified: 42 }),
          ]);
        });

        it("should clear collection records", async () => {
          await articles.clear();
          const { data } = await articles.list();
          data.should.have.lengthOf(0);
        });

        it("should clear collection timestamp", async () => {
          await articles.db.saveLastModified(42);
          await articles.clear();
          const lastModified = await articles.db.getLastModified();
          expect(lastModified).to.equal(null);
        });

        it("should clear collection metadata", async () => {
          await articles.clear();
          const metadata = await articles.metadata();
          expect(metadata).to.equal(null);
        });
      });

      /** @test {Collection#create} */
      describe("#create", () => {
        let articles: Collection;

        beforeEach(() => {
          articles = testCollection();
        });

        it("should create a record and return created record data", async () => {
          const res = await articles.create(article);
          res.should.have.property("data");
        });

        it("should create a record and return created record perms", async () => {
          const res = await articles.create(article);
          res.should.have.property("permissions");
        });

        it("should assign an id to the created record", async () => {
          const {
            data: { id },
          } = await articles.create(article);
          id.should.be.a("string");
        });

        it("should assign an id to the created record (custom IdSchema)", async () => {
          articles = testCollection({ idSchema: createIntegerIdSchema() });

          const {
            data: { id },
          } = await articles.create(article);
          id.should.be.a("number");
        });

        it("should accept a record for the 'generate' function", async () => {
          articles = testCollection({ idSchema: createKeyListIdSchema() });

          const {
            data: { id },
          } = await articles.create(article);
          id.should.equal("title,url");
        });

        it("should reject when useRecordId is true and record is missing an id", async () => {
          await expectAsyncError(
            () => articles.create({ title: "foo" }, { useRecordId: true }),
            /Missing required Id/
          );
        });

        it("should reject when synced is true and record is missing an id", async () => {
          await expectAsyncError(
            () => articles.create({ title: "foo" }, { synced: true }),
            /Missing required Id/
          );
        });

        it("should reject when passed an id and synced and useRecordId are false", async () => {
          await expectAsyncError(
            () =>
              articles.create(
                { id: "some-id" },
                { synced: false, useRecordId: false }
              ),
            /Extraneous Id/
          );
        });

        it("should not alter original record", async () => {
          const res = await articles.create(article);
          res.should.not.deep.equal(article);
        });

        it("should add record status on creation", async () => {
          const res = await articles.create(article);
          res.data._status.should.equal("created");
        });

        it("should reject if passed argument is not an object", async () => {
          await expectAsyncError(
            () => articles.create(42 as any),
            /is not an object/
          );
        });

        it("should actually persist the record into the collection", async () => {
          const result = await articles.create(article);
          const res = await articles.get(result.data.id);
          res.data.title.should.equal(article.title);
        });

        it("should support the useRecordId option", async () => {
          const testId = uuid4();
          const result = await articles.create(
            { id: testId, title: "foo" },
            { useRecordId: true }
          );
          const res = await articles.get(result.data.id);
          res.data.id.should.equal(testId);
        });

        it("should validate record's Id when provided", async () => {
          await expectAsyncError(
            () =>
              articles.create(
                { id: "a/b", title: "foo" },
                { useRecordId: true }
              ),
            /Invalid Id/
          );
        });

        it("should validate record's Id when provided (custom IdSchema)", async () => {
          articles = testCollection({ idSchema: createIntegerIdSchema() });

          await expectAsyncError(
            () =>
              articles.create(
                { id: "deadbeef", title: "foo" },
                { useRecordId: true }
              ),
            /Invalid Id/
          );
        });

        it("should reject with any encountered transaction error", async () => {
          sandbox
            .stub(articles.db, "execute")
            .returns(Promise.reject(new Error("transaction error")));

          await expectAsyncError(
            () => articles.create({ title: "foo" }),
            /transaction error/
          );
        });

        it("should reject with a hint if useRecordId has been used", async () => {
          const res = await articles.create(
            { id: uuid4() },
            { useRecordId: true }
          );
          await articles.delete(res.data.id);

          await expectAsyncError(
            () => articles.create({ id: res.data.id }, { useRecordId: true }),
            /virtually deleted/
          );
        });

        it("should throw error when using createKeyValueStoreIdSchema.generate", () => {
          articles = testCollection({
            idSchema: createKeyValueStoreIdSchema(),
          });
          expect(() => articles.create(article)).to.throw(
            "createKeyValueStoreIdSchema() does not generate an id"
          );
        });

        it("should return true when using createKeyValueStoreIdSchema.validate", async () => {
          articles = testCollection({
            idSchema: createKeyValueStoreIdSchema(),
          });
          const result = await articles.create(
            { ...article, id: article.title },
            { useRecordId: true }
          );

          const res = await articles.getAny(result.data.id);
          res.data.id.should.equal(article.title);
        });
      });

      /** @test {Collection#update} */
      describe("#update", () => {
        let articles: Collection;

        beforeEach(() => {
          articles = testCollection({ localFields: ["read"] });
        });

        it("should update a record", async () => {
          const res = await articles.create(article);
          const { data: existing } = await articles.get(res.data.id);
          const res_1 = await articles.update({
            ...existing,
            title: "new title",
          });
          const res_2 = await articles.get(res_1.data.id);
          res_2.data.title.should.equal("new title");
        });

        it("should return the old data for the record", async () => {
          const res = await articles.create(article);
          const { data: existing } = await articles.get(res.data.id);
          const updateRes = await articles.update({
            ...existing,
            title: "new title",
          });
          updateRes.oldRecord.title.should.equal("foo");
        });

        it("should update record status on update", async () => {
          const { data } = await articles.create(
            { id: uuid4() },
            { synced: true }
          );
          const {
            data: { _status },
          } = await articles.update({ ...data, title: "blah" });
          _status.should.equal("updated");
        });

        it("should not update record status if only local fields are changed", async () => {
          const { data } = await articles.create(
            { id: uuid4() },
            { synced: true }
          );
          const {
            data: { _status },
          } = await articles.update({ ...data, read: true });
          _status.should.equal("synced");
        });

        it("should reject updates on a non-existent record", async () => {
          await expectAsyncError(
            () => articles.update({ id: uuid4() }),
            /not found/
          );
        });

        it("should reject updates on a non-object record", async () => {
          await expectAsyncError(
            () => articles.update("invalid" as any),
            /Record is not an object/
          );
        });

        it("should reject updates on a record without an id", async () => {
          await expectAsyncError(
            () => articles.update({ title: "foo" } as any),
            /missing id/
          );
        });

        it("should validate record's id when provided", async () => {
          await expectAsyncError(
            () => articles.update({ id: 42 } as any),
            /Invalid Id/
          );
        });

        it("should validate record's id when provided (custom IdSchema)", async () => {
          articles = testCollection({ idSchema: createIntegerIdSchema() });

          await expectAsyncError(
            () => articles.update({ id: "deadbeef" }),
            /Invalid Id/
          );
        });

        it("should update a record from its id (custom IdSchema)", async () => {
          articles = testCollection({ idSchema: createIntegerIdSchema() });

          const result = await articles.create(article);
          const res = await articles.update({
            id: result.data.id,
            title: "foo",
          });
          res.data.title.should.equal("foo");
        });

        it("should patch existing record when patch option is used", async () => {
          const id = uuid4();
          await articles.create(
            { id, title: "foo", last_modified: 42 },
            { useRecordId: true, synced: true }
          );
          const res = await articles.update({ id, rank: 99 }, { patch: true });
          res.data.should.deep.equal({
            id,
            title: "foo",
            rank: 99,
            last_modified: 42,
            _status: "updated",
          });
        });

        it("should remove previous record fields", async () => {
          const {
            data: { id },
          } = await articles.create(article);
          const { data } = await articles.update({ id, title: "new title" });
          expect(data).not.to.have.property("url");
        });

        it("should preserve record.last_modified", async () => {
          const {
            data: { id },
          } = await articles.create({
            title: "foo",
            url: "http://foo",
            last_modified: 123456789012,
          });
          const { data } = await articles.update({ id, title: "new title" });
          data.should.have.property("last_modified").equal(123456789012);
        });

        it("should optionally mark a record as synced", async () => {
          const { data } = await articles.create({ title: "foo" });
          const { data: updateData } = await articles.update(
            { ...data, title: "bar" },
            { synced: true }
          );
          updateData.should.have.property("_status").equal("synced");
        });

        it("should preserve created status if record was never synced", async () => {
          const { data } = await articles.create({ title: "foo" });
          const { data: updateData } = await articles.update({
            ...data,
            title: "bar",
          });
          updateData.should.have.property("_status").equal("created");
        });
      });

      /** @test {Collection#put} */
      describe("#put", () => {
        let articles: Collection;

        beforeEach(() => {
          articles = testCollection();
        });

        it("should update a record", async () => {
          const {
            data: { id },
          } = await articles.create(article);
          const { data: existing } = await articles.get(id);
          await articles.upsert({ ...existing, title: "new title" });
          const {
            data: { title },
          } = await articles.get(id);
          title.should.equal("new title");
        });

        it("should change record status to updated", async () => {
          const res = await articles.create({ id: uuid4() }, { synced: true });
          const data = res.data;
          const res_1 = await articles.upsert({ ...data, title: "blah" });
          res_1.data._status.should.equal("updated");
        });

        it("should preserve created status if record was never synced", async () => {
          const res = await articles.create({ title: "foo" });
          const res_1 = await articles.upsert({ ...res.data, title: "bar" });
          res_1.data.should.have.property("_status").equal("created");
        });

        it("should create a new record if non-existent", async () => {
          const res = await articles.upsert({
            id: uuid4(),
            title: "new title",
          });
          res.data.title.should.equal("new title");
        });

        it("should set status to created if it created a record", async () => {
          const res = await articles.upsert({ id: uuid4() });
          res.data._status.should.equal("created");
        });

        it("should reject updates on a non-object record", async () => {
          await expectAsyncError(
            () => articles.upsert("invalid"),
            /Record is not an object/
          );
        });

        it("should reject updates on a record without an id", async () => {
          await expectAsyncError(
            () => articles.upsert({ title: "foo" }),
            /missing id/
          );
        });

        it("should validate record's id when provided", async () => {
          await expectAsyncError(
            () => articles.upsert({ id: 42 }),
            /Invalid Id/
          );
        });

        it("should update deleted records", async () => {
          const res = await articles.create(article);
          const res_1 = await articles.get(res.data.id);
          const res_2 = await articles.delete(res_1.data.id);
          const res_3 = await articles.upsert({
            ...res_2.data,
            title: "new title",
          });
          res_3.data.title.should.equal("new title");
        });

        it("should set status of deleted records to updated", async () => {
          const res = await articles.create(article);
          const res_1 = await articles.get(res.data.id);
          const res_2 = await articles.delete(res_1.data.id);
          const res_3 = await articles.upsert({
            ...res_2.data,
            title: "new title",
          });
          res_3.data._status.should.equal("updated");
        });

        it("should validate record's id when provided (custom IdSchema)", async () => {
          articles = testCollection({ idSchema: createIntegerIdSchema() });

          await expectAsyncError(
            () => articles.upsert({ id: "deadbeef" }),
            /Invalid Id/
          );
        });

        it("should remove previous record fields", async () => {
          const res = await articles.create(article);
          const res_1 = await articles.get(res.data.id);
          const res_2 = await articles.upsert({
            id: res_1.data.id,
            title: "new title",
          });
          res_2.data.should.not.have.property("url");
        });

        it("should preserve record.last_modified", async () => {
          const res = await articles.create({
            title: "foo",
            url: "http://foo",
            last_modified: 123456789012,
          });
          const res_1 = await articles.get(res.data.id);
          const res_2 = await articles.upsert({
            id: res_1.data.id,
            title: "new title",
          });
          res_2.data.should.have.property("last_modified").equal(123456789012);
        });

        it("should return the old data for the record", async () => {
          const res = await articles.create(article);
          const res_1 = await articles.get(res.data.id);
          const existing = res_1.data;
          const res_2 = await articles.upsert({
            ...existing,
            title: "new title",
          });
          res_2.oldRecord.title.should.equal("foo");
        });

        it("should not return the old data for a deleted record", async () => {
          const res = await articles.create(article);
          const articleId = res.data.id;
          await articles.delete(articleId);
          const res_2 = await articles.upsert({
            id: articleId,
            title: "new title",
          });
          expect(res_2.oldRecord).to.equal(undefined);
        });

        it("should signal when a record was created by oldRecord=undefined", async () => {
          const res = await articles.upsert({ id: uuid4() });
          expect(res.oldRecord).to.equal(undefined);
        });
      });

      /** @test {Collection#cleanLocalFields} */
      describe("#cleanLocalFields", () => {
        it("should remove the local fields", () => {
          const collection = testCollection();
          const record = { id: "1", _status: "synced", last_modified: 42 };
          const cleaned = collection.cleanLocalFields(record);

          expect(cleaned).eql({ id: "1", last_modified: 42 });
        });

        it("should take into account collection local fields", () => {
          const collection = testCollection({ localFields: ["size"] });
          const record = {
            id: "1",
            size: 3.14,
            _status: "synced",
            last_modified: 42,
          };
          const cleaned = collection.cleanLocalFields(record);

          expect(cleaned).eql({ id: "1", last_modified: 42 });
        });
      });

      /** @test {Collection#resolve} */
      describe("#resolve", () => {
        let articles: Collection, local: any, remote: any, conflict: any;

        beforeEach(async () => {
          articles = testCollection();
          const res = await articles.create(
            { id: uuid4(), title: "local title", last_modified: 41 },
            { synced: true }
          );
          local = res.data;
          remote = {
            ...local,
            title: "blah",
            last_modified: 42,
          };
          conflict = {
            type: "incoming",
            local,
            remote,
          };
        });

        it("should mark a record as updated", async () => {
          const resolution = { ...local, title: "resolved" };
          const res = await articles.resolve(conflict, resolution);
          res.data.should.deep.equal({
            _status: "updated",
            id: local.id,
            title: resolution.title,
            last_modified: remote.last_modified,
          });
        });

        it("should mark a record as synced if resolved with remote", async () => {
          const resolution = { ...local, title: remote.title };
          const res = await articles.resolve(conflict, resolution);
          res.data.should.deep.equal({
            _status: "synced",
            id: local.id,
            title: resolution.title,
            last_modified: remote.last_modified,
          });
        });
      });

      /** @test {Collection#get} */
      describe("#get", () => {
        let articles: Collection, id: string;

        beforeEach(async () => {
          articles = testCollection();
          const result = await articles.create(article);
          return (id = result.data.id);
        });

        it("should isolate records by bucket", async () => {
          const otherbucket = new Collection("other", TEST_COLLECTION_NAME, {
            api,
          } as unknown as KintoBase<any>);

          await expectAsyncError(() => otherbucket.get(id), /not found/);
        });

        it("should retrieve a record from its id", async () => {
          const res = await articles.get(id);
          res.data.title.should.equal(article.title);
        });

        it("should retrieve a record from its id (custom IdSchema)", async () => {
          articles = testCollection({ idSchema: createIntegerIdSchema() });

          // First, get rid of the old record with the ID from the other ID schema
          await articles.clear();
          const result_1 = await articles.create(article);
          const res = await articles.get(result_1.data.id);
          res.data.title.should.equal(article.title);
        });

        it("should validate passed id", async () => {
          await expectAsyncError(() => articles.get(42 as any), /Invalid Id/);
        });

        it("should validate passed id (custom IdSchema)", async () => {
          await expectAsyncError(() => articles.get("dead.beef"), /Invalid Id/);
        });

        it("should have record status info attached", async () => {
          const res = await articles.get(id);
          res.data._status.should.equal("created");
        });

        it("should reject in case of record not found", async () => {
          await expectAsyncError(() => articles.get(uuid4()), /not found/);
        });

        it("should reject on virtually deleted record", async () => {
          await articles.delete(id);
          await expectAsyncError(() => articles.get(id), /not found/);
        });

        it("should retrieve deleted record with includeDeleted", async () => {
          await articles.delete(id);
          const res_1 = await articles.get(id, { includeDeleted: true });
          res_1.data.should.deep.equal({
            _status: "deleted",
            id,
            title: "foo",
            url: "http://foo",
          });
        });
      });

      /** @test {Collection#getAny} */
      describe("#getAny", () => {
        let articles: Collection, id: string;

        beforeEach(async () => {
          articles = testCollection();
          const result = await articles.create(article);
          id = result.data.id;
        });

        it("should retrieve a record from its id", async () => {
          const res = await articles.getAny(id);
          res.data!.title.should.equal(article.title);
        });

        it("should resolve to undefined if not present", async () => {
          const res = await articles.getAny(uuid4());
          expect(res.data).to.equal(undefined);
        });

        it("should resolve to virtually deleted record", async () => {
          await articles.delete(id);
          const res_1 = await articles.getAny(id);
          res_1.data.should.deep.equal({
            _status: "deleted",
            id,
            title: "foo",
            url: "http://foo",
          });
        });
      });

      /** @test {Collection#delete} */
      describe("#delete", () => {
        let articles: Collection, id: string;

        beforeEach(async () => {
          articles = testCollection();
          const result = await articles.create(article);
          return (id = result.data.id);
        });

        it("should validate passed id", async () => {
          await expectAsyncError(
            () => articles.delete(42 as any),
            /Invalid Id/
          );
        });

        it("should validate passed id (custom IdSchema)", async () => {
          await expectAsyncError(
            () => articles.delete("dead beef"),
            /Invalid Id/
          );
        });

        describe("Virtual", () => {
          it("should virtually delete a record", async () => {
            const res = await articles.delete(id, { virtual: true });
            const res_1 = await articles.get(res.data.id, {
              includeDeleted: true,
            });
            res_1.data._status.should.equal("deleted");
          });

          it("should reject on non-existent record", async () => {
            await expectAsyncError(
              () => articles.delete(uuid4(), { virtual: true }),
              /not found/
            );
          });

          it("should reject on already deleted record", async () => {
            await articles.delete(id, { virtual: true });
            await expectAsyncError(
              () => articles.delete(id, { virtual: true }),
              /not found/
            );
          });

          it("should return deleted record", async () => {
            const res = await articles.delete(id, { virtual: true });
            res.data.should.have.property("title").equal("foo");
          });
        });

        describe("Factual", () => {
          it("should factually delete a record", async () => {
            const res = await articles.delete(id, { virtual: true });
            await expectAsyncError(
              () => articles.get(res.data.id),
              /not found/
            );
          });

          it("should resolve with deletion information", async () => {
            const res = await articles.delete(id, { virtual: false });
            res.data.should.have.property("id").equal(id);
          });

          it("should reject on non-existent record", async () => {
            await expectAsyncError(
              () => articles.delete(uuid4(), { virtual: false }),
              /not found/
            );
          });

          it("should delete if already virtually deleted", async () => {
            await articles.delete(id);
            const res = await articles.delete(id, { virtual: false });
            res.data.should.have.property("id").equal(id);
          });

          it("should return deleted record", async () => {
            const res = await articles.delete(id, { virtual: false });
            res.data.should.have.property("title").equal("foo");
          });
        });
      });

      /** @test {Collection#deleteAll} */
      describe("#deleteAll", () => {
        let articles: Collection;

        beforeEach(async () => {
          //Create 5 Records
          articles = testCollection();
          await articles.create(article);
          await articles.create(article);
          await articles.create(article);
          await articles.create(article);
          await articles.create(article);
        });

        it("should be able to soft delete all articles", async () => {
          await articles.deleteAll();
          const res = await articles.list();
          res.data.should.have.lengthOf(0);

          const res_1 = await articles.list({}, { includeDeleted: true });
          res_1.data.should.have.lengthOf(5);
        });

        it("should not delete anything when there are no records", async () => {
          await articles.clear();
          const res_1 = await articles.deleteAll();
          res_1.data.should.have.lengthOf(0);
        });
      });

      /** @test {Collection#deleteAny} */
      describe("#deleteAny", () => {
        let articles: Collection, id: string;

        beforeEach(async () => {
          articles = testCollection();
          const result = await articles.create(article);
          return (id = result.data.id);
        });

        it("should delete an existing record", async () => {
          const res = await articles.deleteAny(id);
          const res_1 = await articles.getAny(res.data.id);
          res_1.data!._status.should.equal("deleted");
        });

        it("should resolve on non-existant record", async () => {
          const id = uuid4();
          const res = await articles.deleteAny(id);
          res.data.id.should.equal(id);
        });

        it("should indicate that it deleted", async () => {
          const res = await articles.deleteAny(id);
          res.deleted.should.equal(true);
        });

        it("should indicate that it didn't delete when record is gone", async () => {
          const id = uuid4();
          const res = await articles.deleteAny(id);
          res.deleted.should.equal(false);
        });

        it("should return deleted record", async () => {
          const res = await articles.deleteAny(id);
          res.data.should.have.property("title").equal("foo");
        });
      });

      /** @test {Collection#list} */
      describe("#list", () => {
        let articles: Collection;

        describe("Basic", () => {
          beforeEach(() => {
            articles = testCollection();
            return Promise.all([
              articles.create(article),
              articles.create({ title: "bar", url: "http://bar" }),
            ]);
          });

          it("should retrieve the list of records", async () => {
            const res = await articles.list();
            res.data.should.have.lengthOf(2);
          });

          it("shouldn't list virtually deleted records", async () => {
            const res = await articles.create({ title: "yay" });
            await articles.delete(res.data.id);
            const res_1 = await articles.list();
            res_1.data.should.have.lengthOf(2);
          });

          it("should support the includeDeleted option", async () => {
            const res = await articles.create({ title: "yay" });
            await articles.delete(res.data.id);
            const res_1 = await articles.list({}, { includeDeleted: true });
            res_1.data.should.have.lengthOf(3);
          });
        });

        describe("Ordering", () => {
          const fixtures = [
            { title: "art1", last_modified: 2, unread: false },
            { title: "art2", last_modified: 3, unread: true },
            { title: "art3", last_modified: 1, unread: false },
          ];

          beforeEach(() => {
            articles = testCollection();
            return Promise.all(fixtures.map((r) => articles.create(r)));
          });

          it("should order records on last_modified DESC by default", async () => {
            const res = await articles.list();
            res.data
              .map((r) => r.title)
              .should.deep.equal(["art2", "art1", "art3"]);
          });

          it("should order records on custom field ASC", async () => {
            const res = await articles.list({ order: "title" });
            res.data
              .map((r) => r.title)
              .should.deep.equal(["art1", "art2", "art3"]);
          });

          it("should order records on custom field DESC", async () => {
            const res = await articles.list({ order: "-title" });
            res.data
              .map((r) => r.title)
              .should.deep.equal(["art3", "art2", "art1"]);
          });

          it("should order records on boolean values ASC", async () => {
            const res = await articles.list({ order: "unread" });
            res.data
              .map((r) => r.unread)
              .should.deep.equal([false, false, true]);
          });

          it("should order records on boolean values DESC", async () => {
            const res = await articles.list({ order: "-unread" });
            res.data
              .map((r) => r.unread)
              .should.deep.equal([true, false, false]);
          });
        });

        describe("Filtering", () => {
          const fixtures = [
            { title: "art1", last_modified: 3, unread: true, complete: true },
            { title: "art2", last_modified: 2, unread: false, complete: true },
            {
              id: uuid4(),
              title: "art3",
              last_modified: 1,
              unread: true,
              complete: false,
            },
          ];

          beforeEach(() => {
            articles = testCollection();
            return Promise.all([
              articles.create(fixtures[0]),
              articles.create(fixtures[1]),
              articles.create(fixtures[2], { synced: true }),
            ]);
          });

          it("should filter records on indexed fields", async () => {
            const res = await articles.list({
              filters: { _status: "created" },
            });
            res.data.map((r) => r.title).should.deep.equal(["art1", "art2"]);
          });

          it("should filter records on existing field", async () => {
            const res = await articles.list({ filters: { unread: true } });
            res.data.map((r) => r.title).should.deep.equal(["art1", "art3"]);
          });

          it("should filter records on missing field", async () => {
            const res = await articles.list({ filters: { missing: true } });
            res.data.map((r) => r.title).should.deep.equal([]);
          });

          it("should filter records on multiple fields using 'and'", async () => {
            const res = await articles.list({
              filters: { unread: true, complete: true },
            });
            res.data.map((r) => r.title).should.deep.equal(["art1"]);
          });
        });

        describe("SubObject Filtering", () => {
          const fixtures = [
            {
              title: "art1",
              last_modified: 3,
              unread: true,
              complete: true,
              author: {
                name: "John",
                city: "Miami",
                otherBook: {
                  title: "book1",
                },
              },
            },
            {
              title: "art2",
              last_modified: 2,
              unread: false,
              complete: true,
              author: {
                name: "Daniel",
                city: "New York",
                otherBook: {
                  title: "book2",
                },
              },
            },
            {
              title: "art3",
              last_modified: 1,
              unread: true,
              complete: true,
              author: {
                name: "John",
                city: "Chicago",
                otherBook: {
                  title: "book3",
                },
              },
            },
          ];

          beforeEach(() => {
            articles = testCollection();
            return Promise.all(fixtures.map((r) => articles.create(r)));
          });

          it("Filters nested objects", async () => {
            const res = await articles.list({
              filters: {
                "author.name": "John",
                "author.otherBook.title": "book3",
              },
            });
            res.data
              .map((r) => {
                return r.title;
              })
              .should.deep.equal(["art3"]);
          });

          it("should return empty array if missing subObject field", async () => {
            const res = await articles.list({
              filters: {
                "author.name": "John",
                "author.unknownField": "blahblahblah",
              },
            });
            res.data.should.deep.equal([]);
          });
        });

        describe("Ordering & Filtering", () => {
          const fixtures = [
            { title: "art1", last_modified: 3, unread: true, complete: true },
            { title: "art2", last_modified: 2, unread: false, complete: true },
            { title: "art3", last_modified: 1, unread: true, complete: true },
          ];

          beforeEach(() => {
            articles = testCollection();
            return Promise.all(fixtures.map((r) => articles.create(r)));
          });

          it("should order and filter records", async () => {
            const res = await articles.list({
              order: "-title",
              filters: { unread: true, complete: true },
            });
            res.data
              .map((r: any) => {
                return {
                  title: r.title,
                  unread: r.unread,
                  complete: r.complete,
                };
              })
              .should.deep.equal([
                { title: "art3", unread: true, complete: true },
                { title: "art1", unread: true, complete: true },
              ]);
          });
        });
      });

      /**
       * @deprecated
       * @test {Collection#loadDump}
       */
      describe("Deprecated #loadDump", () => {
        let articles: Collection;

        it("should call importBulk", () => {
          articles = testCollection();
          const importBulkStub = sandbox
            .stub(articles, "importBulk")
            .returns(Promise.resolve([]));
          articles
            .loadDump([
              { id: uuid4(), title: "foo", last_modified: 1452347896 },
              { id: uuid4(), title: "bar", last_modified: 1452347985 },
            ])
            .then(() => sinon.assert.calledOnce(importBulkStub));
        });
      });

      /** @test {Collection#importBulk} */
      describe("#importBulk", () => {
        let articles: Collection;

        beforeEach(() => {
          articles = testCollection();
        });

        it("should import records in the collection", async () => {
          const res = await articles.importBulk([
            { id: uuid4(), title: "foo", last_modified: 1452347896 },
            { id: uuid4(), title: "bar", last_modified: 1452347985 },
          ]);
          res.should.have.lengthOf(2);
        });

        it("should fail if records is not an array", async () => {
          await expectAsyncError(
            () => articles.importBulk({ id: "abc", title: "foo" } as any),
            /^Records is not an array./
          );
        });

        it("should fail if id is invalid", async () => {
          await expectAsyncError(
            () =>
              articles.importBulk([
                { id: "a.b.c", title: "foo", last_modified: 0 },
              ]),
            /^Record has invalid ID./
          );
        });

        it("should fail if id is missing", async () => {
          await expectAsyncError(
            () => articles.importBulk([{ title: "foo" } as any]),
            /^Record has invalid ID./
          );
        });

        it("should fail if last_modified is missing", async () => {
          await expectAsyncError(
            () => articles.importBulk([{ id: uuid4(), title: "foo" } as any]),
            /^Record has no last_modified value./
          );
        });

        it("should mark imported records as synced.", async () => {
          const testId = uuid4();
          await articles.importBulk([
            { id: testId, title: "foo", last_modified: 1457896541 },
          ]);
          const res = await articles.get(testId);
          res.data._status.should.equal("synced");
        });

        it("should ignore already imported records.", async () => {
          const record = {
            id: uuid4(),
            title: "foo",
            last_modified: 1457896541,
          };
          await articles.importBulk([record]);
          const res = await articles.importBulk([record]);
          res.should.have.lengthOf(0);
        });

        it("should overwrite old records.", async () => {
          const record = {
            id: "a-record",
            title: "foo",
            last_modified: 1457896541,
          };
          await articles.importBulk([record]);
          const updated = { ...record, last_modified: 1457896543 };
          const res = await articles.importBulk([updated]);
          res.should.have.lengthOf(1);
        });

        it("should not overwrite unsynced records.", async () => {
          const result = await articles.create({ title: "foo" });
          const record = {
            id: result.data.id,
            title: "foo",
            last_modified: 1457896541,
          };
          const res = await articles.importBulk([record]);
          res.should.have.lengthOf(0);
        });

        it("should not overwrite records without last modified.", async () => {
          const result = await articles.create(
            { id: uuid4(), title: "foo" },
            { synced: true }
          );
          const record = {
            id: result.data.id,
            title: "foo",
            last_modified: 1457896541,
          };
          const res = await articles.importBulk([record]);
          res.should.have.lengthOf(0);
        });
      });

      /** @test {Collection#gatherLocalChanges} */
      describe("#gatherLocalChanges", () => {
        let articles: Collection;

        describe("transformers", () => {
          it("should asynchronously encode records", async () => {
            articles = testCollection({
              remoteTransformers: [
                createEncodeTransformer("?", 10),
                createEncodeTransformer("!", 5),
              ],
            });

            await Promise.all([
              articles.create({ title: "abcdef" }),
              articles.create({ title: "ghijkl" }),
            ]);

            const res = await articles.gatherLocalChanges();
            res
              .map((r) => (r as any).title)
              .sort()
              .should.deep.equal(["abcdef?!", "ghijkl?!"]);
          });

          it("should encode even deleted records", async () => {
            const transformer = {
              called: false,
              encode(record: any) {
                this.called = true;
                return { ...record, id: "remote-" + record.id };
              },
              decode() {},
            };
            articles = testCollection({
              idSchema: NULL_SCHEMA,
              remoteTransformers: [transformer],
            });
            const id = uuid4();
            await articles.create(
              { id, title: "some title" },
              { synced: true }
            );
            await articles.delete(id);
            const changes = await articles.gatherLocalChanges();
            expect(transformer.called).equal(true);
            expect(
              changes.filter((change: any) => change._status === "deleted")[0]
            ).property("id", "remote-" + id);
          });
        });
      });

      /** @test {Collection#pullChanges} */
      describe("#pullChanges", () => {
        let client: KintoClientCollection,
          articles: Collection,
          listRecords: sinon.SinonStub,
          result: SyncResultObject;

        beforeEach(() => {
          articles = testCollection();
          result = new SyncResultObject();
        });

        describe("When no conflicts occured", () => {
          const id_1 = uuid4();
          const id_2 = uuid4();
          const id_3 = uuid4();
          const id_4 = uuid4();
          const id_5 = uuid4();
          const id_6 = uuid4();
          const id_7 = uuid4();
          const id_8 = uuid4();
          const id_9 = uuid4();

          const localData = [
            { id: id_1, title: "art1" },
            { id: id_2, title: "art2" },
            { id: id_4, title: "art4" },
            { id: id_5, title: "art5" },
            { id: id_7, title: "art7-a" },
            { id: id_9, title: "art9" }, // will be deleted in beforeEach().
          ];
          const serverChanges: KintoObject[] = [
            { id: id_2, title: "art2", last_modified: 0 }, // existing & untouched, skipped
            { id: id_3, title: "art3", last_modified: 0 }, // to be created
            { id: id_4, deleted: true, last_modified: 0 }, // to be deleted
            { id: id_6, deleted: true, last_modified: 0 }, // remotely deleted & missing locally, skipped
            { id: id_7, title: "art7-b", last_modified: 0 }, // remotely conflicting
            { id: id_8, title: "art8", last_modified: 0 }, // to be created
            { id: id_9, deleted: true, last_modified: 0 }, // remotely deleted & deleted locally, skipped
          ];

          beforeEach(async () => {
            listRecords = sandbox
              .stub(KintoClientCollection.prototype, "listRecords")
              .returns(
                Promise.resolve({
                  data: serverChanges,
                  next: (() => {}) as any,
                  last_modified: "42",
                  hasNextPage: false,
                  totalRecords: 0,
                })
              ) as any;
            client = new Api("http://server.com/v1")
              .bucket("bucket")
              .collection("collection");
            await Promise.all(
              localData.map((fixture) => {
                return articles.create(fixture, { synced: true });
              })
            );
            await articles.delete(id_9);
          });

          it("should not fetch remote records if result status isn't ok", async () => {
            const withConflicts = new SyncResultObject();
            withConflicts.add("conflicts", [1 as any]);
            await articles.pullChanges(client, withConflicts);
            return sinon.assert.notCalled(listRecords);
          });

          it("should fetch remote changes from the server", async () => {
            await articles.pullChanges(client, result);
            sinon.assert.calledOnce(listRecords);
            sinon.assert.calledWithExactly(listRecords, {
              since: undefined,
              filters: undefined,
              retry: undefined,
              pages: Infinity,
              headers: {},
            });
          });

          it("should use timestamp to fetch remote changes from the server", async () => {
            await articles.pullChanges(client, result, { lastModified: 42 });
            sinon.assert.calledOnce(listRecords);
            sinon.assert.calledWithExactly(listRecords, {
              since: "42",
              filters: undefined,
              retry: undefined,
              pages: Infinity,
              headers: {},
            });
          });

          it("should pass provided filters when polling changes from server", async () => {
            const exclude = [{ id: 1 }, { id: 2 }, { id: 3 }];
            await articles.pullChanges(client, result, {
              lastModified: 42,
              exclude,
            });
            sinon.assert.calledOnce(listRecords);
            sinon.assert.calledWithExactly(listRecords, {
              since: "42",
              filters: { exclude_id: "1,2,3" },
              retry: undefined,
              pages: Infinity,
              headers: {},
            });
          });

          it("should respect expectedTimestamp when requesting changes", async () => {
            await articles.pullChanges(client, result, {
              expectedTimestamp: '"123"',
            });
            sinon.assert.calledOnce(listRecords);
            sinon.assert.calledWithExactly(listRecords, {
              since: undefined,
              filters: { _expected: '"123"' },
              retry: undefined,
              pages: Infinity,
              headers: {},
            });
          });

          it("should resolve with imported creations", async () => {
            const res = await articles.pullChanges(client, result);
            res.created.should.deep.equal([
              {
                id: id_3,
                title: "art3",
                last_modified: 0,
                _status: "synced",
              },
              {
                id: id_8,
                title: "art8",
                last_modified: 0,
                _status: "synced",
              },
            ]);
          });

          it("should resolve with imported updates", async () => {
            const res = await articles.pullChanges(client, result);
            res.updated.should.deep.equal([
              {
                new: {
                  id: id_7,
                  title: "art7-b",
                  last_modified: 0,
                  _status: "synced",
                },
                old: {
                  id: id_7,
                  title: "art7-a",
                  _status: "synced",
                },
              },
            ]);
          });

          it("should resolve with imported deletions", async () => {
            const res = await articles.pullChanges(client, result);
            res.deleted.should.deep.equal([
              { id: id_4, title: "art4", _status: "synced" },
            ]);
          });

          it("should resolve with no conflicts detected", async () => {
            const res = await articles.pullChanges(client, result);
            res.conflicts.should.deep.equal([]);
          });

          it("should actually import changes into the collection", async () => {
            await articles.pullChanges(client, result);
            const res = await articles.list({ order: "title" });
            res.data.should.deep.equal([
              { id: id_1, title: "art1", _status: "synced" },
              { id: id_2, title: "art2", last_modified: 0, _status: "synced" },
              { id: id_3, title: "art3", last_modified: 0, _status: "synced" },
              { id: id_5, title: "art5", _status: "synced" },
              {
                id: id_7,
                title: "art7-b",
                last_modified: 0,
                _status: "synced",
              },
              { id: id_8, title: "art8", last_modified: 0, _status: "synced" },
            ]);
          });

          it("should skip deleted data missing locally", async () => {
            const res = await articles.pullChanges(client, result);
            expect(res.skipped).eql([
              { id: id_6, last_modified: 0, deleted: true },
              { id: id_9, title: "art9", _status: "deleted" },
            ]);
          });

          it("should not list identical records as skipped", async () => {
            const res = await articles.pullChanges(client, result);
            res.skipped.should.not.contain({
              id: id_2,
              title: "art2",
              _status: "synced",
            });
          });

          describe("incoming changes hook", () => {
            it("should be called", async () => {
              let hookCalled = false;
              articles = testCollection({
                hooks: {
                  "incoming-changes": [
                    function (payload: any) {
                      hookCalled = true;
                      return payload;
                    },
                  ],
                },
              });

              await articles.pullChanges(client, result);
              expect(hookCalled).to.equal(true);
            });

            it("should reject the promise if the hook throws", async () => {
              articles = testCollection({
                hooks: {
                  "incoming-changes": [
                    function (changes: any) {
                      throw new Error("Invalid collection data");
                    },
                  ],
                },
              });

              await expectAsyncError(
                () => articles.pullChanges(client, result),
                /Invalid collection data/
              );
            });

            it("should use the results of the hooks", async () => {
              articles = testCollection({
                hooks: {
                  "incoming-changes": [
                    function (incoming: any) {
                      const newChanges = incoming.changes.map((r: any) => ({
                        ...r,
                        foo: "bar",
                      }));
                      return { ...incoming, changes: newChanges };
                    },
                  ],
                },
              });

              const r = await articles.pullChanges(client, result);
              expect(r.created.length).to.equal(2);
              r.created.forEach((r) => {
                expect(r.foo).to.equal("bar");
              });
              expect(r.updated.length).to.equal(2);
              r.updated.forEach((r) => {
                expect(r.new.foo).to.equal("bar");
              });
            });

            it("should be able to chain hooks", async () => {
              function hookFactory(fn: Function) {
                return function (incoming: any) {
                  const returnedChanges = incoming;
                  const newChanges = returnedChanges.changes.map(fn);
                  return { ...incoming, newChanges };
                };
              }
              articles = testCollection({
                hooks: {
                  // N.B. This only works because it's mutating serverChanges
                  "incoming-changes": [
                    hookFactory((r: any) => {
                      r.foo = "bar";
                      r.debug = "1824";
                      return r;
                    }),
                    hookFactory((r: any) => {
                      r.bar = "baz";
                      return r;
                    }),
                  ],
                },
              });

              const r = await articles.pullChanges(client, result);
              expect(r.created.length).to.equal(2);
              r.created.forEach((r) => {
                expect(r.foo).to.equal("bar");
                expect(r.bar).to.equal("baz");
              });
              expect(r.updated.length).to.equal(2);
              r.updated.forEach((r) => {
                expect(r.new.foo).to.equal("bar");
                expect(r.new.bar).to.equal("baz");
              });
            });

            it("should pass the collection as the second argument", async () => {
              let passedCollection: Collection | null = null;
              articles = testCollection({
                hooks: {
                  "incoming-changes": [
                    function (payload: any, collection: Collection) {
                      passedCollection = collection;
                      return payload;
                    },
                  ],
                },
              });

              await articles.pullChanges(client, result);
              expect(passedCollection).to.equal(articles);
            });

            it("should reject if the hook returns something strange", async () => {
              articles = testCollection({
                hooks: {
                  "incoming-changes": [() => 42],
                },
              });

              await expectAsyncError(
                () => articles.pullChanges(client, result),
                /Invalid return value for hook: 42 has no 'then\(\)' or 'changes' properties/
              );
            });

            it("should resolve if the hook returns a promise", async () => {
              articles = testCollection({
                hooks: {
                  "incoming-changes": [
                    (payload: any) => {
                      const newChanges = payload.changes.map((r: any) => ({
                        ...r,
                        foo: "bar",
                      }));
                      return Promise.resolve({
                        ...payload,
                        changes: newChanges,
                      });
                    },
                  ],
                },
              });
              const r = await articles.pullChanges(client, result);
              expect(r.created.length).to.equal(2);
              r.created.forEach((r) => {
                expect(r.foo).to.equal("bar");
              });
            });
          });

          describe("With transformers", () => {
            function createDecodeTransformer(char: string) {
              return {
                encode() {},
                decode(record: any) {
                  return { ...record, title: record.title + char };
                },
              };
            }

            beforeEach(() => {
              listRecords.returns(
                Promise.resolve({
                  data: [{ id: uuid4(), title: "bar" }],
                  next: () => {},
                  last_modified: "42",
                })
              );
            });

            it("should decode incoming encoded records using a single transformer", async () => {
              articles = testCollection({
                remoteTransformers: [createDecodeTransformer("#")],
              });

              const res = await articles.pullChanges(client, result);
              res.created[0].title.should.equal("bar#");
            });

            it("should decode incoming encoded records using multiple transformers", async () => {
              articles = testCollection({
                remoteTransformers: [
                  createDecodeTransformer("!"),
                  createDecodeTransformer("?"),
                ],
              });

              const res = await articles.pullChanges(client, result);
              res.created[0].title.should.equal("bar?!"); // reversed because we decode in the opposite order
            });

            it("should decode incoming records even when deleted", async () => {
              const transformer = {
                called: false,
                encode() {},
                decode(record: any) {
                  this.called = true;
                  return { ...record, id: "local-" + record.id };
                },
              };
              articles = testCollection({
                idSchema: NULL_SCHEMA,
                remoteTransformers: [transformer],
              });
              const id = uuid4();
              listRecords.returns(
                Promise.resolve({
                  data: [{ id, deleted: true }],
                  next: () => {},
                  last_modified: "42",
                })
              );
              await articles.create(
                { id: "local-" + id, title: "some title" },
                { synced: true }
              );
              const res = await articles.pullChanges(client, result);
              expect(transformer.called).equal(true);
              res.deleted[0].should.have.property("id").equal("local-" + id);
            });
          });

          describe("Error handling", () => {
            it("should expose any import transaction error", async () => {
              const error = new Error("bad");
              const rejection = Promise.reject(error);
              rejection.catch(() => {});
              sandbox.stub(articles.db, "execute").returns(rejection);

              const res = await articles.pullChanges(client, result);
              res.errors.should.deep.equal([
                {
                  type: "incoming",
                  message: error.message,
                  stack: error.stack,
                },
              ]);
            });
          });
        });

        describe("When a conflict occured", () => {
          let createdId: string, local: KintoIdObject;

          beforeEach(async () => {
            const res = await articles.create({ title: "art2" });
            local = res.data;
            createdId = local.id;
          });

          it("should resolve listing conflicting changes with MANUAL strategy", async () => {
            sandbox
              .stub(KintoClientCollection.prototype, "listRecords")
              .returns(
                Promise.resolve({
                  data: [
                    { id: createdId, title: "art2mod", last_modified: 42 }, // will conflict with unsynced local record
                  ],
                  next: (() => {}) as any,
                  last_modified: "42",
                  hasNextPage: false,
                  totalRecords: 1,
                })
              );

            const res = await articles.pullChanges(client, result);
            res["toObject"]().should.deep.equal({
              ok: false,
              lastModified: 42,
              errors: [],
              created: [],
              updated: [],
              deleted: [],
              skipped: [],
              published: [],
              conflicts: [
                {
                  type: "incoming",
                  local: {
                    _status: "created",
                    id: createdId,
                    title: "art2",
                  },
                  remote: {
                    id: createdId,
                    title: "art2mod",
                    last_modified: 42,
                  },
                },
              ],
              resolved: [],
            });
          });

          it("should ignore resolved conflicts during sync", async () => {
            const remote = { ...local, title: "blah", last_modified: 42 };
            const conflict = {
              type: "incoming" as const,
              local,
              remote,
            };
            const resolution = { ...local, title: "resolved" };
            sandbox
              .stub(KintoClientCollection.prototype, "listRecords")
              .returns(
                Promise.resolve({
                  data: [remote],
                  next: (() => {}) as any,
                  last_modified: "42",
                  hasNextPage: false,
                  totalRecords: 1,
                })
              );
            const syncResult = new SyncResultObject();
            await articles.resolve(conflict, resolution);
            const result = await articles.pullChanges(client, syncResult);
            result["toObject"]().should.deep.equal({
              ok: true,
              lastModified: 42,
              errors: [],
              created: [],
              published: [],
              resolved: [],
              skipped: [],
              deleted: [],
              conflicts: [],
              updated: [],
            });
          });
        });

        describe("When a resolvable conflict occured", () => {
          let createdId: string;

          beforeEach(async () => {
            const res = await articles.create({ title: "art2" });
            createdId = res.data.id;
            sandbox
              .stub(KintoClientCollection.prototype, "listRecords")
              .returns(
                Promise.resolve({
                  data: [{ id: createdId, title: "art2", last_modified: 0 }],
                  next: (() => {}) as any,
                  last_modified: "42",
                  hasNextPage: false,
                  totalRecords: 1,
                })
              );
          });

          it("should resolve with solved changes", async () => {
            const res = await articles.pullChanges(client, result);
            res["toObject"]().should.deep.equal({
              ok: true,
              lastModified: 42,
              errors: [],
              created: [],
              published: [],
              updated: [
                {
                  old: { id: createdId, title: "art2", _status: "created" },
                  new: {
                    id: createdId,
                    title: "art2",
                    last_modified: 0,
                    _status: "synced",
                  },
                },
              ],
              skipped: [],
              deleted: [],
              conflicts: [],
              resolved: [],
            });
          });
        });
      });

      /** @test {Collection#importChanges} */
      describe("#importChanges", () => {
        let articles: Collection, result: SyncResultObject;

        beforeEach(() => {
          articles = testCollection();
          result = new SyncResultObject();
        });

        it("should return errors when encountered", async () => {
          const error = new Error("unknown error");
          sandbox.stub(articles.db, "execute").returns(Promise.reject(error));

          const res = await articles.importChanges(result, [{ title: "bar" }]);
          res.errors.should.deep.equal([
            {
              type: "incoming",
              message: error.message,
              stack: error.stack,
            },
          ]);
        });

        it("should only retrieve the changed record", async () => {
          const id1 = uuid4();
          const id2 = uuid4();
          const execute = sandbox
            .stub(articles.db, "execute")
            .returns(Promise.resolve([]));

          await articles.importChanges(result, [
            { id: id1, title: "foo" },
            { id: id2, title: "bar" },
          ]);
          const preload = execute.lastCall.args[1]!.preload;
          expect(preload).eql([id1, id2]);
        });

        it("should merge remote with local fields", async () => {
          const id1 = uuid4();
          await articles.create(
            { id: id1, title: "bar", size: 12 },
            { synced: true }
          );
          const res = await articles.importChanges(result, [
            { id: id1, title: "foo" },
          ]);
          expect(res.updated[0].new.title).equal("foo");
          expect(res.updated[0].new.size).equal(12);
        });

        it("should ignore local fields when detecting conflicts", async () => {
          const id1 = uuid4();
          articles = testCollection({ localFields: ["size"] });
          // Create record with status not synced.
          await articles.create(
            { id: id1, title: "bar", size: 12, last_modified: 42 },
            { useRecordId: true }
          );
          const res = await articles.importChanges(result, [
            { id: id1, title: "bar", last_modified: 43 },
          ]);
          // No conflict, local.title == remote.title.
          expect(res.ok).equal(true);
          expect(res.updated[0].new.title).equal("bar");
          // Local field is preserved
          expect(res.updated[0].new.size).equal(12);
          // Timestamp was taken from remote
          expect(res.updated[0].new.last_modified).equal(43);
        });

        it("should overwrite local records with PULL_ONLY", async () => {
          const id1 = uuid4();
          const id2 = uuid4();
          const id3 = uuid4();
          await articles.create({ id: id1, title: "bar" }, { synced: true });
          await articles.update({ id: id1, title: "foo" });
          await articles.create({ id: id3, title: "bam" }, { synced: true });
          const res = await articles.importChanges(
            result,
            [
              { id: id1, title: "baz", last_modified: 123 },
              { id: id2, title: "pow", last_modified: 124 },
              { id: id3, deleted: true, last_modified: 125 },
            ],
            Collection.strategy.PULL_ONLY
          );
          expect(res.ok).equal(true);
          expect(res.resolved.length).equal(0);
          expect(res.published.length).equal(0);
          expect(res.created.length).equal(1);
          expect(res.updated.length).equal(1);
          expect(res.deleted.length).equal(1);
          expect(res.created[0].title).equal("pow");
          expect(res.updated[0].old.title).equal("foo");
          expect(res.updated[0].new.title).equal("baz");
          expect(res.deleted[0].id).equal(id3);
        });
      });

      /** @test {Collection#pushChanges} */
      describe("#pushChanges", () => {
        let client: KintoClientCollection,
          articles: Collection,
          result: SyncResultObject;
        const records = [{ id: uuid4(), title: "foo", _status: "created" }];

        beforeEach(() => {
          client = new Api("http://server.com/v1")
            .bucket("bucket")
            .collection("collection");
          articles = testCollection();
          result = new SyncResultObject();
        });

        it("should publish local changes to the server", async () => {
          const batchRequests = sandbox
            .stub(Api.prototype, "_batchRequests" as any)
            .returns(Promise.resolve([{}]));

          await articles.pushChanges(client, records, result);
          const requests = batchRequests.firstCall.args[0];
          const options = batchRequests.firstCall.args[1];
          expect(requests).to.have.lengthOf(1);
          expect(requests[0].body.data.title).equal("foo");
          expect(options.safe).equal(true);
        });

        it("should not publish local fields to the server", async () => {
          const batchRequests = sandbox
            .stub(Api.prototype, "_batchRequests" as any)
            .returns(Promise.resolve([{}]));

          articles = testCollection({ localFields: ["size"] });
          const toSync = [{ ...records[0], title: "ah", size: 3.14 }];
          await articles.pushChanges(client, toSync, result);
          const requests = batchRequests.firstCall.args[0];
          expect(requests[0].body.data.title).equal("ah");
          expect(requests[0].body.data.size).to.not.exist;
        });

        it("should update published records local status", async () => {
          sandbox.stub(KintoClientCollection.prototype, "batch").returns(
            Promise.resolve({
              published: [{ data: records[0] }],
              errors: [],
              conflicts: [],
              skipped: [],
            })
          );
          const res = await articles.pushChanges(client, records, result);
          res.published.should.deep.equal([
            {
              _status: "synced",
              id: records[0].id,
              title: "foo",
            },
          ]);
        });

        it("should not publish records created and deleted locally and never synced", async () => {
          const batchRequests = sandbox
            .stub(Api.prototype, "_batchRequests" as any)
            .returns(Promise.resolve([]));

          const toDelete = [{ id: records[0].id, _status: "deleted" }]; // no timestamp.
          await articles.pushChanges(client, toDelete, result);
          const requests = batchRequests.firstCall.args[0];
          expect(requests).eql([]);
        });

        it("should delete unsynced virtually deleted local records", async () => {
          const record = await articles.create({
            title: "record to be deleted",
          });
          sandbox.stub(KintoClientCollection.prototype, "batch").returns(
            Promise.resolve({
              published: [{ data: { id: record.data.id, deleted: true } }],
              errors: [],
              conflicts: [],
              skipped: [],
            })
          );
          await articles.delete(record.data.id);
          await articles.pushChanges(client, records, result);
          await expectAsyncError(
            () => articles.get(record.data.id, { includeDeleted: true }),
            /not found/
          );
        });

        it("should delete locally the records deleted remotely", async () => {
          sandbox.stub(KintoClientCollection.prototype, "batch").returns(
            Promise.resolve({
              published: [{ data: { id: records[0].id, deleted: true } }],
              errors: [],
              conflicts: [],
              skipped: [],
            })
          );
          const res = await articles.pushChanges(client, [], result);
          res.published.should.deep.equal([
            { id: records[0].id, deleted: true },
          ]);
        });

        it("should delete locally the records already deleted remotely", async () => {
          const id = records[0].id;
          sandbox.stub(KintoClientCollection.prototype, "batch").returns(
            Promise.resolve({
              published: [],
              errors: [],
              conflicts: [],
              skipped: [
                {
                  id,
                  error: { errno: 110, code: 404, error: "Not found" },
                },
              ],
            })
          );
          await articles.create(
            { id, title: "bar" },
            { useRecordId: true, synced: true }
          );
          await articles.pushChanges(client, records, result);
          await expectAsyncError(
            () => articles.get(id, { includeDeleted: true }),
            /not found/
          );
        });

        describe("Batch requests made", () => {
          let batch: {
              deleteRecord: () => void;
              createRecord: () => void;
              updateRecord: () => void;
            },
            batchSpy: sinon.SinonMock,
            deleteRecord: sinon.SinonExpectation,
            createRecord: sinon.SinonExpectation,
            updateRecord: sinon.SinonExpectation;
          beforeEach(() => {
            batch = {
              deleteRecord() {},
              createRecord() {},
              updateRecord() {},
            };
            batchSpy = sandbox.mock(batch);
            deleteRecord = batchSpy.expects("deleteRecord");
            createRecord = batchSpy.expects("createRecord");
            updateRecord = batchSpy.expects("updateRecord");
            sandbox
              .stub(KintoClientCollection.prototype, "batch")
              .callsFake((f) => {
                f(batch as unknown as KintoClientCollection);
                return Promise.resolve({
                  published: [],
                  errors: [],
                  conflicts: [],
                  skipped: [],
                });
              });
          });

          it("should call delete() for deleted records", async () => {
            const myDeletedRecord = {
              id: "deleted-record-id",
              _status: "deleted",
              last_modified: 1234,
            };
            deleteRecord.once();
            createRecord.never();
            updateRecord.never();
            await articles.pushChanges(client, [myDeletedRecord], result);
            batchSpy.verify();
            deleteRecord.firstCall.args.should.deep.equal([myDeletedRecord]);
          });

          it("should call create() for created records", async () => {
            const myCreatedRecord = {
              id: "created-record-id",
              _status: "created",
            };
            deleteRecord.never();
            createRecord.once();
            updateRecord.never();
            await articles.pushChanges(client, [myCreatedRecord], result);
            batchSpy.verify();
            createRecord.firstCall.args.should.deep.equal([
              { id: "created-record-id" },
            ]);
          });

          it("should call update() for updated records", async () => {
            const myUpdatedRecord = {
              id: "updated-record-id",
              _status: "updated",
              last_modified: 1234,
            };
            deleteRecord.never();
            createRecord.never();
            updateRecord.once();
            await articles.pushChanges(client, [myUpdatedRecord], result);
            batchSpy.verify();
            updateRecord.firstCall.args.should.deep.equal([
              { id: "updated-record-id", last_modified: 1234 },
            ]);
          });
        });

        describe("Error handling", () => {
          const error = {
            path: "/buckets/default/collections/test/records/123",
            sent: {
              path: "/buckets/default/collections/test/records/123",
              headers: {},
            },
            error: { errno: 999, message: "Internal error" },
          };

          beforeEach(() => {
            sandbox.stub(KintoClientCollection.prototype, "batch").returns(
              Promise.resolve({
                errors: [error],
                published: [],
                conflicts: [],
                skipped: [],
              })
            );
          });

          it("should report encountered publication errors", async () => {
            const res = await articles.pushChanges(client, records, result);
            res.errors.should.deep.equal([{ ...error, type: "outgoing" }]);
          });

          it("should report typed publication errors", async () => {
            const res = await articles.pushChanges(client, records, result);
            res.errors[0].should.have.property("type").equal("outgoing");
          });
        });
      });

      /** @test {Collection#resetSyncStatus} */
      describe("#resetSyncStatus", () => {
        const fixtures = [
          { id: uuid4(), last_modified: 42, title: "art1" },
          { id: uuid4(), last_modified: 42, title: "art2" },
          { id: uuid4(), last_modified: 42, title: "art3" },
        ];
        let articles: Collection;

        beforeEach(async () => {
          articles = testCollection();
          await Promise.all(
            fixtures.map((fixture) => {
              return articles.create(fixture, { synced: true });
            })
          );
          return articles.delete(fixtures[1].id);
        });

        it("should reset the synced status of all local records", async () => {
          await articles.resetSyncStatus();
          const list = await articles.list({ filters: { _status: "synced" } });
          list.should.have.property("data").to.have.length(0);
        });

        it("should garbage collect the locally deleted records", async () => {
          await articles.resetSyncStatus();
          const list = await articles.list(
            { filters: { _status: "deleted" } },
            { includeDeleted: true }
          );
          list.should.have.property("data").to.have.length(0);
        });

        it("should clear last modified value of all records", async () => {
          await articles.resetSyncStatus();
          const res = await articles.list();
          expect(res.data.some((r) => r.last_modified)).to.equal(false);
        });

        it("should clear any previously saved lastModified value", async () => {
          await articles.resetSyncStatus();
          const lastModified = await articles.db.getLastModified();
          expect(lastModified).to.equal(null);
        });

        it("should resolve with the number of local records processed ", async () => {
          const num = await articles.resetSyncStatus();
          num.should.equal(3);
        });
      });

      /** @test {Collection#sync} */
      describe("#sync", () => {
        const fixtures = [
          { title: "art1" },
          { title: "art2" },
          { title: "art3" },
        ];
        let articles: Collection, ids: string[];

        beforeEach(async () => {
          articles = testCollection();
          sandbox.stub(api, "batch").get(() => () => ({
            errors: [] as any[],
            published: [] as any[],
            conflicts: [] as any[],
            skipped: [] as any[],
          }));
          const res = await Promise.all(
            fixtures.map((fixture) => articles.create(fixture))
          );
          ids = res.map((r) => r.data.id);
        });

        it("should validate the remote option", async () => {
          await expectAsyncError(
            () => articles.sync({ remote: "http://fake.invalid" }),
            /contain the version/
          );
        });

        it("should use a custom remote option", async () => {
          sandbox.stub(articles, "importChanges");
          sandbox
            .stub(articles, "pushChanges")
            .returns(Promise.resolve(new SyncResultObject()));
          const fetch = sandbox
            .stub(articles.api.http, "timedFetch")
            .returns(fakeServerResponse(200, { data: [] }, {}) as any);

          await articles.sync({ remote: "http://test/v1" });
          sinon.assert.calledWith(
            fetch,
            sinon.match(/http:\/\/test\/v1/),
            sinon.match.any
          );
        });

        it("should revert the custom remote option on success", async () => {
          sandbox.stub(articles, "importChanges");
          sandbox
            .stub(articles, "pushChanges")
            .returns(Promise.resolve(new SyncResultObject()));
          sandbox
            .stub(articles.api.http, "timedFetch")
            .returns(fakeServerResponse(200, { data: [] }, {}) as any);

          await articles.sync({ remote: "http://test/v1" });
          expect(api.remote).equal(FAKE_SERVER_URL);
        });

        it("should revert the custom remote option on failure", async () => {
          sandbox.stub(articles, "importChanges");
          const rejection = Promise.reject("boom");
          rejection.catch(() => {});
          sandbox.stub(articles, "pushChanges").returns(rejection);
          sandbox
            .stub(articles.api.http, "timedFetch")
            .returns(fakeServerResponse(200, { data: [] }, {}) as any);

          try {
            await articles.sync({ remote: "http://test/v1" });
          } catch (e) {}
          expect(api.remote).equal(FAKE_SERVER_URL);
        });

        it("should load fixtures", async () => {
          const res = await articles.list();
          res.data.should.have.lengthOf(3);
        });

        it("should pullMetadata with options", async () => {
          const pullMetadata = sandbox.stub(articles, "pullMetadata");
          sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
            Promise.resolve({
              last_modified: "42",
              next: (() => {}) as any,
              data: [],
              hasNextPage: false,
              totalRecords: 0,
            })
          );
          const options = {
            headers: {
              Authorization: "Basic 123",
            },
          };
          await articles.sync(options);
          expect(pullMetadata.callCount).equal(1);
          // First argument is the client, which we don't care too much about
          // Second argument is the options
          expect(pullMetadata.getCall(0).args[1]).include(options);
        });

        it("should fetch latest changes from the server", async () => {
          sandbox.stub(articles, "pullMetadata");
          const listRecords = sandbox
            .stub(KintoClientCollection.prototype, "listRecords")
            .returns(
              Promise.resolve({
                last_modified: "42",
                next: (() => {}) as any,
                data: [],
                hasNextPage: false,
                totalRecords: 0,
              })
            );
          await articles.sync();
          // Never synced so we fetch all the records from the server
          sinon.assert.calledWithMatch(listRecords, { since: undefined });
        });

        it("should store latest lastModified value when no conflicts", async () => {
          sandbox.stub(articles, "pullMetadata");
          sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
            Promise.resolve({
              last_modified: "42",
              next: (() => {}) as any,
              data: [],
              hasNextPage: false,
              totalRecords: 0,
            })
          );
          await articles.sync();
          expect(articles.lastModified).equal(42);
        });

        it("shouldn't store latest lastModified on conflicts", async () => {
          sandbox.stub(articles, "pullMetadata");
          sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
            Promise.resolve({
              last_modified: "43",
              next: (() => {}) as any,
              data: [
                {
                  id: ids[0],
                  title: "art1mod",
                  last_modified: 43,
                },
              ],
              hasNextPage: false,
              totalRecords: 1,
            })
          );
          await articles.sync();
          expect(articles.lastModified).equal(null);
        });

        it("shouldn't store latest lastModified on errors", async () => {
          sandbox.stub(articles, "pullMetadata");
          sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
            Promise.resolve({
              last_modified: "43",
              next: (() => {}) as any,
              data: [
                {
                  id: ids[0],
                  title: "art1mod",
                  last_modified: 0,
                },
              ],
              hasNextPage: false,
              totalRecords: 0,
            })
          );
          const rejection = Promise.reject(new Error("error"));
          rejection.catch(() => {});
          sandbox.stub(articles.db, "execute").returns(rejection);
          await articles.sync();
          expect(articles.lastModified).equal(null);
        });

        it("should not execute a last pull on push failure", async () => {
          sandbox.stub(articles, "pullMetadata");
          const pullChanges = sandbox.stub(articles, "pullChanges");
          sandbox
            .stub(articles, "pushChanges")
            .callsFake((client, changes, result) => {
              result.add("conflicts", [1 as any]);
              return Promise.resolve(result);
            });
          await articles.sync();
          return sinon.assert.calledOnce(pullChanges);
        });

        it("should not execute a last pull if nothing to push", async () => {
          sandbox.stub(articles, "pullMetadata");
          sandbox
            .stub(articles, "gatherLocalChanges")
            .returns(Promise.resolve([]));
          const pullChanges = sandbox
            .stub(articles, "pullChanges")
            .returns(Promise.resolve(new SyncResultObject()));
          await articles.sync();
          sinon.assert.calledOnce(pullChanges);
        });

        it("should not redownload pushed changes", async () => {
          const record1 = { id: uuid4(), title: "blog" };
          const record2 = { id: uuid4(), title: "post" };
          sandbox.stub(articles, "pullMetadata");
          const pullChangesStub = sandbox.stub(articles, "pullChanges");
          sandbox
            .stub(articles, "pushChanges")
            .callsFake((client, changes, result) => {
              result.add("published", record1);
              result.add("published", record2);
              return Promise.resolve(result);
            });
          const res = await articles.sync();
          expect(res.published).to.have.length(2);
          expect(pullChangesStub.lastCall.args[2]!.exclude).eql([
            record1,
            record2,
          ]);
        });

        it("should store collection metadata", async () => {
          sandbox.stub(articles, "pullChanges");
          const metadata = { id: "articles", last_modified: 42 };
          sandbox
            .stub(KintoClientCollection.prototype, "getData")
            .returns(Promise.resolve(metadata));
          await articles.sync();
          const stored = await articles.metadata();
          expect(stored).to.deep.equal(metadata);
        });

        describe("Options", () => {
          let pullChanges: sinon.SinonStub;

          beforeEach(() => {
            sandbox.stub(articles, "pullMetadata");
            pullChanges = sandbox
              .stub(articles, "pullChanges")
              .returns(Promise.resolve(new SyncResultObject())) as any;
          });

          it("should transfer the headers option", async () => {
            await articles.sync({ headers: { Foo: "Bar" } });
            expect(pullChanges.firstCall.args[2])
              .to.have.property("headers")
              .eql({ Foo: "Bar" });
          });

          it("should transfer the strategy option", async () => {
            await articles.sync({ strategy: Collection.strategy.SERVER_WINS });
            expect(pullChanges.firstCall.args[2])
              .to.have.property("strategy")
              .equal(Collection.strategy.SERVER_WINS);
          });

          it("should transfer the retry option", async () => {
            await articles.sync({ retry: 3 });
            expect(pullChanges.firstCall.args[2])
              .to.have.property("retry")
              .equal(3);
          });

          it("should transfer the expectedTimestamp option", async () => {
            await articles.sync({ expectedTimestamp: '"123"' });
            expect(pullChanges.firstCall.args[2])
              .to.have.property("expectedTimestamp")
              .equal('"123"');
          });
        });

        describe("Server backoff", () => {
          it("should reject on server backoff by default", async () => {
            articles.kinto = {
              api: { backoff: 30000 },
            } as unknown as KintoBase<any>;
            await expectAsyncError(
              () => articles.sync(),
              /back off; retry in 30s/
            );
          });

          it("should perform sync on server backoff when ignoreBackoff is true", async () => {
            sandbox
              .stub(articles.db, "getLastModified")
              .returns(Promise.resolve(0));
            sandbox.stub(articles, "pullMetadata");
            const pullChanges = sandbox.stub(articles, "pullChanges");
            sandbox.stub(articles, "pushChanges");
            articles.api.events!.emit("backoff", new Date().getTime() + 30000);

            await articles.sync({ ignoreBackoff: true });
            return sinon.assert.calledOnce(pullChanges);
          });
        });

        describe("Retry", () => {
          let fetch;

          beforeEach(() => {
            // Disable stubbing of HTTP client of upper tests.
            sandbox.restore();
            // Stub low-level fetch instead.
            fetch = sandbox.stub(articles.api.http, "timedFetch");
            // Pull metadata
            fetch
              .onCall(0)
              .returns(fakeServerResponse(200, { data: {} }, {}) as any);
            // Pull records
            fetch
              .onCall(1)
              .returns(fakeServerResponse(200, { data: [] }, {}) as any);
            // Push
            fetch
              .onCall(2)
              .returns(fakeServerResponse(200, { settings: {} }, {}) as any);
            fetch
              .onCall(3)
              .returns(
                fakeServerResponse(503, {}, { "Retry-After": "1" }) as any
              );
            fetch.onCall(4).returns(
              fakeServerResponse(
                200,
                {
                  responses: [
                    {
                      status: 201,
                      body: { data: { id: 1, last_modified: 41 } },
                    },
                    {
                      status: 201,
                      body: { data: { id: 2, last_modified: 42 } },
                    },
                    {
                      status: 201,
                      body: { data: { id: 3, last_modified: 43 } },
                    },
                  ],
                },
                { ETag: '"123"' }
              ) as any
            );
            // Last pull
            fetch
              .onCall(5)
              .returns(fakeServerResponse(200, { data: [] }, {}) as any);
          });

          it("should retry if specified", async () => {
            const result = await articles.sync({ retry: 3 });
            expect(result.ok).equal(true);
          });
        });

        describe("Events", () => {
          let onsuccess: sinon.SinonSpy;
          let onerror: sinon.SinonSpy;
          let pushChangesStub: sinon.SinonStub;

          beforeEach(() => {
            onsuccess = sinon.spy();
            onerror = sinon.spy();
            articles.events.on("sync:success", onsuccess);
            articles.events.on("sync:error", onerror);

            sandbox
              .stub(articles.db, "getLastModified")
              .returns(Promise.resolve(0));
            sandbox.stub(articles, "pullMetadata");
            sandbox.stub(articles, "pullChanges");
            pushChangesStub = sandbox.stub(articles, "pushChanges") as any;
          });

          it("should send a success event", async () => {
            await articles.sync();
            expect(onsuccess.called).equal(true);
            expect(onerror.called).equal(false);
          });

          it("should send an error event", async () => {
            pushChangesStub.throws(new Error("boom"));
            try {
              await articles.sync();
            } catch (e) {
              expect(onsuccess.called).equal(false);
              expect(onerror.called).equal(true);
            }
          });

          it("should provide success details about sync", async () => {
            await articles.sync();
            const data = onsuccess.firstCall.args[0];
            expect(data).to.have.property("result");
            expect(data).to.have.property("remote");
            expect(data).to.have.property("bucket");
            expect(data).to.have.property("collection");
            expect(data).to.have.property("headers");
          });

          it("should provide error details about sync", async () => {
            pushChangesStub.throws(new Error("boom"));
            try {
              await articles.sync();
            } catch (e) {
              const data = onerror.firstCall.args[0];
              expect(data).to.have.property("error");
              expect(data).to.have.property("remote");
              expect(data).to.have.property("bucket");
              expect(data).to.have.property("collection");
              expect(data).to.have.property("headers");
            }
          });
        });
      });

      /** @test {Collection#execute} */
      describe("#execute", () => {
        let articles: Collection;
        beforeEach(() => {
          articles = testCollection();
        });

        it("should support get", async () => {
          const result = await articles.create(article);
          const id = result.data.id;
          const result_1 = await articles.execute((txn) => txn.get(id), {
            preloadIds: [id],
          });
          return expect(result_1.data.title).equal("foo");
        });

        it("should support getAny", async () => {
          const result = await articles.create(article);
          const id = result.data.id;
          const result_1 = await articles.execute((txn) => txn.getAny(id), {
            preloadIds: [id],
          });
          return expect(result_1.data.title).equal("foo");
        });

        it("should support delete", async () => {
          const result = await articles.create(article);
          const id = result.data.id;
          await articles.execute((txn) => txn.delete(id), {
            preloadIds: [id],
          });
          const result_2 = await articles.getAny(id);
          return expect(result_2.data!._status).equal("deleted");
        });

        it("should support deleteAll", async () => {
          const result = await articles.create(article);
          const id = result.data.id;
          await articles.execute((txn) => txn.deleteAll([id]), {
            preloadIds: [id],
          });
          const result_2 = await articles.getAny(id);
          return expect(result_2.data!._status).equal("deleted");
        });

        it("should support deleteAny", async () => {
          const result = await articles.create(article);
          const id = result.data.id;
          await articles.execute((txn) => txn.deleteAny(id), {
            preloadIds: [id],
          });
          const result_2 = await articles.getAny(id);
          return expect(result_2.data!._status).equal("deleted");
        });

        it("should support create", async () => {
          const id = uuid4();
          const result = await articles.execute(
            (txn) => txn.create({ id, ...article }),
            { preloadIds: [id] }
          );
          return expect(result.data.title).equal("foo");
        });

        it("should support update", async () => {
          const result = await articles.create(article);
          const id = result.data.id;
          await articles.execute(
            (txn) => txn.update({ id, title: "new title" }),
            {
              preloadIds: [id],
            }
          );
          const result_2 = await articles.get(id);
          return expect(result_2.data.title).equal("new title");
        });

        it("should support upsert", async () => {
          const id = uuid4();
          await articles.upsert({ id, ...article });
          const result_2 = await articles.get(id);
          return expect(result_2.data.title).equal("foo");
        });

        it("should roll back operations if there's a failure", async () => {
          let id: string;
          try {
            const result = await articles.create(article);
            id = result.data.id;
            await articles.execute(
              (txn) => {
                txn.deleteAny(id);
                txn.delete(uuid4()); // this should fail
              },
              { preloadIds: [id] }
            );
          } catch (e) {}
          const result_2 = await articles.getAny(id);
          return expect(result_2.data!._status).equal("created");
        });

        it("should perform all operations if there's no failure", async () => {
          const result = await articles.create(article);
          const id1 = result.data.id;
          const result_1 = await articles.create({
            title: "foo2",
            url: "http://foo2",
          });
          const id2 = result_1.data.id;
          await articles.execute(
            (txn) => {
              txn.deleteAny(id1);
              txn.deleteAny(id2);
            },
            { preloadIds: [id1, id2] }
          );
          const result_3 = await articles.getAny(id1);
          expect(result_3.data!._status).equal("deleted");
          const result_4 = await articles.getAny(id2);
          return expect(result_4.data!._status).equal("deleted");
        });

        it("should resolve to the return value of the transaction", async () => {
          await articles.create(article);
          const result = await articles.execute((txn) => {
            return "hello";
          });
          return expect(result).equal("hello");
        });

        it("has operations that are synchronous", async () => {
          let createdArticle: typeof article & KintoObject;
          const result = await articles.create(article);
          await articles.execute(
            (txn) => {
              createdArticle = txn.get(result.data.id).data as typeof article &
                KintoObject;
            },
            { preloadIds: [result.data.id] }
          );
          return expect(createdArticle.title).equal("foo");
        });
      });

      /** @test {Collection#pullMetadata} */
      describe("#pullMetadata", () => {
        let articles: Collection;

        beforeEach(() => {
          articles = testCollection();
        });

        it("passes headers to underlying client", async () => {
          const headers = {
            Authorization: "Basic 123",
          };

          const client = {
            getData: sandbox.stub(),
          } as unknown as KintoClientCollection;
          await articles.pullMetadata(client, { headers });
          sinon.assert.calledWithExactly(client.getData as any, {
            headers,
          });
        });
      });

      describe("Events", () => {
        let articles: Collection, article: any;

        beforeEach(async () => {
          articles = testCollection();
          const { data } = await articles.create({ title: "foo" });
          article = data;
        });

        it("should emit an event on create", () => {
          return new Promise((resolve) => {
            articles.events.on("create", resolve);
            articles.create({ title: "win" });
          });
        });

        it("should emit an event on update", () => {
          return new Promise((resolve) => {
            articles.events.on("update", resolve);
            articles.update({ ...article, title: "changed" });
          });
        });

        it("should emit an event on delete", () => {
          return new Promise((resolve) => {
            articles.events.on("delete", resolve);
            articles.delete(article.id);
          });
        });

        it("should emit a 'delete' event when calling deleteAll", () => {
          return new Promise((resolve) => {
            articles.events.on("delete", resolve);
            articles.deleteAll();
          });
        });

        it("should emit a 'deleteAll' event when calling deleteAll", () => {
          return new Promise((resolve) => {
            articles.events.on("deleteAll", resolve);
            articles.deleteAll();
          });
        });

        it("should emit an event on deleteAny", () => {
          return new Promise((resolve) => {
            articles.events.on("delete", resolve);
            articles.deleteAny(article.id);
          });
        });

        it("should not emit if deleteAny fails", () => {
          return new Promise((resolve, reject) => {
            articles.events.on("delete", () => reject(new Error("fail")));
            articles.deleteAny(uuid4()).then(resolve);
          });
        });

        it("should emit a create event on upsert", () => {
          return new Promise((resolve) => {
            articles.events.on("create", resolve);
            articles.upsert({ id: uuid4(), create: "new" });
          });
        });

        it("should emit a update event on upsert", () => {
          return new Promise((resolve) => {
            articles.events.on("update", resolve);
            articles.upsert({ update: "existing", ...article });
          });
        });

        it("should provide created record in data", () => {
          return new Promise<void>((resolve) => {
            articles.events.on("create", (event) => {
              expect(event)
                .to.have.property("data")
                .to.have.property("title")
                .equal("win");
              resolve();
            });
            articles.create({ title: "win" });
          });
        });

        it("should provide new record in data and old record", () => {
          return new Promise<void>((resolve) => {
            articles.events.on("update", (event) => {
              const { data, oldRecord } = event;
              expect(data).to.have.property("title").equal("changed");
              expect(oldRecord).to.have.property("title").equal("foo");
              resolve();
            });
            articles.update({ ...article, title: "changed" });
          });
        });

        it("should not provide oldRecord on creation with upsert", () => {
          return new Promise<void>((resolve) => {
            articles.events.on("create", (event) => {
              expect(event).not.to.have.property("oldRecord");
              resolve();
            });
            articles.upsert({ id: uuid4(), some: "new" });
          });
        });

        it("should provide old record", () => {
          return new Promise<void>((resolve) => {
            articles.events.on("delete", (event) => {
              expect(event)
                .to.have.property("data")
                .to.have.property("title")
                .equal("foo");
              resolve();
            });
            articles.delete(article.id);
          });
        });

        describe("Transactions", () => {
          it("should send every events of a transaction", async () => {
            const callback = sinon.spy();
            articles.events.on("create", callback);

            await articles.execute((txn) => {
              txn.create({ id: uuid4(), title: "foo" });
              txn.create({ id: uuid4(), title: "bar" });
            });
            return expect(callback.callCount).to.equal(2);
          });

          it("should not send any event if the transaction fails", async () => {
            const callback = sinon.spy();
            articles.events.on("create", callback);

            try {
              await articles.execute((txn) => {
                txn.create({ id: uuid4(), title: "foo" });
                throw new Error("Fail!");
              });
            } catch (e) {}
            return expect(callback.callCount).equal(0);
          });

          it("should not send any change event if nothing happens in transaction", async () => {
            const callback = sinon.spy();
            articles.events.on("change", callback);

            await articles.execute((txn) => {
              txn.deleteAny(uuid4());
            });
            return expect(callback.callCount).equal(0);
          });

          it("should send a single changed event for the whole transaction", async () => {
            const callback = sinon.spy();
            const id = uuid4();
            const id2 = uuid4();

            await articles.create({ id, title: "foo" }, { useRecordId: true });
            articles.events.on("change", callback);
            await articles.execute(
              (txn) => {
                txn.create({ id: id2, title: "bar" });
                txn.update({ id, size: 42 });
                txn.delete(id);
              },
              { preloadIds: [id] }
            );
            expect(callback.callCount).equal(1);
            const payload = callback.lastCall.args[0];
            const { targets } = payload;
            expect(targets.length).equal(3);
            expect(targets[0]).eql({
              action: "create",
              data: { id: id2, title: "bar" },
            });
            expect(targets[1]).eql({
              action: "update",
              data: { _status: "created", id, size: 42 },
              oldRecord: { _status: "created", id, title: "foo" },
            });
            expect(targets[2]).eql({
              action: "delete",
              data: { _status: "created", id, title: "foo" },
            });
          });
        });
      });
    });
  }

  runSuite("IDB", (dbName: string, options) => new IDB(dbName, options));

  // Instead of creating a new adapter each time, reuse existing adapter.
  // This is to mimic the persistence of the IDB adapter.
  const memoryAdapter = new Memory();
  runSuite("Memory", (dbName: string, options) => memoryAdapter);
});
