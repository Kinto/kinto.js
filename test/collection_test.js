"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import { EventEmitter } from "events";
import { default as uuid4 } from "uuid/v4";

import IDB from "../src/adapters/IDB";
import BaseAdapter from "../src/adapters/base";
import Collection, { SyncResultObject } from "../src/collection";
import Api from "kinto-http";
import KintoClient from "kinto-http";
import KintoClientCollection from "kinto-http/lib/cjs-es5/collection.js";
import { recordsEqual } from "../src/collection";
import { updateTitleWithDelay, fakeServerResponse } from "./test_utils";
import { createKeyValueStoreIdSchema } from "../src/collection";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

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
  /*eslint-disable */
  let sandbox, events, idSchema, remoteTransformers, hooks, api;
  /*eslint-enable */
  const article = { title: "foo", url: "http://foo" };

  function testCollection(options = {}) {
    events = new EventEmitter();
    const opts = { events, ...options };
    api = new Api(FAKE_SERVER_URL, events);
    return new Collection(
      TEST_BUCKET_NAME,
      TEST_COLLECTION_NAME,
      { api },
      opts
    );
  }

  function createEncodeTransformer(char, delay) {
    return {
      encode(record) {
        return updateTitleWithDelay(record, char, delay);
      },
      decode(record) {},
    };
  }

  function createIntegerIdSchema() {
    let _next = 0;
    return {
      generate() {
        return _next++;
      },
      validate(id) {
        return id == parseInt(id, 10) && id >= 0;
      },
    };
  }

  function createKeyListIdSchema() {
    return {
      generate(record) {
        return Object.keys(record)
          .sort()
          .join(",");
      },
      validate(id) {
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
        ).eql(true);
      });

      it("should compare record data without metadata nor local fields", () => {
        expect(
          recordsEqual(
            { title: "foo", _status: "foo", size: 32 },
            { title: "foo" },
            ["size"]
          )
        ).eql(true);
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
        { api },
        { events }
      );
      expect(collection.events).to.eql(events);
    });

    it("should propagate its events property to child dependencies", () => {
      const events = new EventEmitter();
      const api = new Api(FAKE_SERVER_URL, { events });
      const collection = new Collection(
        TEST_BUCKET_NAME,
        TEST_COLLECTION_NAME,
        { api },
        { events }
      );
      expect(collection.api.events).eql(collection.events);
      expect(collection.api.http.events).eql(collection.events);
    });

    it("should allow providing a prefix for the db name", () => {
      const collection = new Collection(
        TEST_BUCKET_NAME,
        TEST_COLLECTION_NAME,
        { api },
        {
          adapterOptions: {
            dbName: "LocalData",
          },
        }
      );
      expect(collection.db.dbName).eql("LocalData");
      expect(collection.db.cid).eql(
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
        { api },
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
          { api },
          {
            adapter: function() {},
          }
        );
      }).to.Throw(Error, /Unsupported adapter/);
    });

    it("should allow providing an adapter option", () => {
      const MyAdapter = class extends BaseAdapter {};
      const collection = new Collection(
        TEST_BUCKET_NAME,
        TEST_COLLECTION_NAME,
        { api },
        {
          adapter: MyAdapter,
        }
      );
      expect(collection.db).to.be.an.instanceOf(MyAdapter);
    });

    it("should pass adapterOptions to adapter", () => {
      let myOptions;
      const MyAdapter = class extends BaseAdapter {
        constructor(collectionName, options) {
          super(collectionName);
          myOptions = options;
        }
      };
      new Collection(
        TEST_BUCKET_NAME,
        TEST_COLLECTION_NAME,
        { api },
        {
          adapter: MyAdapter,
          adapterOptions: "my options",
        }
      );
      expect(myOptions).eql("my options");
    });

    describe("transformers registration", () => {
      function registerTransformers(transformers) {
        new Collection(
          TEST_BUCKET_NAME,
          TEST_COLLECTION_NAME,
          { api },
          {
            remoteTransformers: transformers,
          }
        );
      }

      it("should throw an error on non-array remoteTransformers", () => {
        expect(registerTransformers.bind(null, {})).to.Throw(
          Error,
          /remoteTransformers should be an array/
        );
      });

      it("should throw an error on non-object transformer", () => {
        expect(registerTransformers.bind(null, ["invalid"])).to.Throw(
          Error,
          /transformer must be an object/
        );
      });

      it("should throw an error on encode method missing", () => {
        expect(registerTransformers.bind(null, [{ decode() {} }])).to.Throw(
          Error,
          /transformer must provide an encode function/
        );
      });

      it("should throw an error on decode method missing", () => {
        expect(registerTransformers.bind(null, [{ encode() {} }])).to.Throw(
          Error,
          /transformer must provide a decode function/
        );
      });
    });

    describe("hooks registration", () => {
      function registerHooks(hooks) {
        return new Collection(
          TEST_BUCKET_NAME,
          TEST_COLLECTION_NAME,
          { api },
          {
            hooks,
          }
        );
      }

      it("should throw an error on non-object hooks", () => {
        expect(registerHooks.bind(null, function() {})).to.Throw(
          Error,
          /hooks should be an object/
        );
      });

      it("should throw an error on array hooks", () => {
        expect(registerHooks.bind(null, [])).to.Throw(
          Error,
          /hooks should be an object, not an array./
        );
      });

      it("should return a empty object if no hook where specified", () => {
        const collection = registerHooks();
        expect(collection.hooks).to.eql({});
      });

      it("should throw an error on unknown hook", () => {
        expect(
          registerHooks.bind(null, {
            invalid: [],
          })
        ).to.Throw(Error, /The hook should be one of/);
      });

      it("should throw if the hook isn't a list", () => {
        expect(
          registerHooks.bind(null, {
            "incoming-changes": {},
          })
        ).to.Throw(Error, /A hook definition should be an array of functions./);
      });

      it("should throw an error if the hook is not an array of functions", () => {
        expect(
          registerHooks.bind(null, {
            "incoming-changes": ["invalid"],
          })
        ).to.Throw(Error, /A hook definition should be an array of functions./);
      });
    });

    describe("idSchema registration", () => {
      function registerIdSchema(idSchema) {
        new Collection(
          TEST_BUCKET_NAME,
          TEST_COLLECTION_NAME,
          { api },
          {
            idSchema: idSchema,
          }
        );
      }

      it("should throw an error on non-object transformer", () => {
        expect(registerIdSchema.bind(null, "invalid")).to.Throw(
          Error,
          /idSchema must be an object/
        );
      });

      it("should throw an error on generate method missing", () => {
        expect(
          registerIdSchema.bind(null, {
            validate() {},
          })
        ).to.Throw(Error, /idSchema must provide a generate function/);
      });

      it("should throw an error on validate method missing", () => {
        expect(
          registerIdSchema.bind(null, {
            generate() {},
          })
        ).to.Throw(Error, /idSchema must provide a validate function/);
      });
    });
  });

  /** @test {SyncResultObject} */
  describe("SyncResultObject", () => {
    it("should create a result object", () => {
      const r = new SyncResultObject();
      expect(r.lastModified).to.eql(null);
      [
        "errors",
        "created",
        "updated",
        "deleted",
        "published",
        "conflicts",
        "skipped",
      ].forEach(l => expect(r[l]).to.eql([]));
    });

    describe("set lastModified", () => {
      it("should set lastModified", () => {
        const result = new SyncResultObject();

        result.lastModified = 42;

        expect(result.lastModified).eql(42);
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

        result.add("created", [{ id: 1, name: "a" }, { id: 1, name: "b" }]);
        expect(result.created).eql([{ id: 1, name: "b" }]);
      });

      it("should update the ok status flag on errors", () => {
        const result = new SyncResultObject();

        result.add("errors", [1]);

        expect(result.ok).eql(false);
      });

      it("should update the ok status flag on conflicts", () => {
        const result = new SyncResultObject();

        result.add("conflicts", [1]);

        expect(result.ok).eql(false);
      });

      it("should alter non-array properties", () => {
        const result = new SyncResultObject();

        result.add("ok", false);

        expect(result.ok).eql(true);
      });

      it("should return the current result object", () => {
        const result = new SyncResultObject();

        expect(result.add("resolved", [])).eql(result);
      });

      it("should support adding single objects", () => {
        const result = new SyncResultObject();

        const e = {
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
          .add("resolved", [1, 2, 3])
          .reset("resolved");

        expect(result.resolved).eql([]);
      });

      it("should return the current result object", () => {
        const result = new SyncResultObject();

        expect(result.reset("resolved")).eql(result);
      });
    });
  });

  /** @test {Collection#clear} */
  describe("#clear", () => {
    let articles;

    beforeEach(() => {
      articles = testCollection();
      return Promise.all([
        articles.create({ title: "foo" }),
        articles.create({ title: "bar" }),
        articles.db.saveMetadata({ id: "articles", last_modified: 42 }),
      ]);
    });

    it("should clear collection records", () => {
      return articles
        .clear()
        .then(_ => articles.list())
        .then(res => res.data)
        .should.eventually.have.length.of(0);
    });

    it("should clear collection timestamp", () => {
      return articles.db
        .saveLastModified(42)
        .then(_ => articles.clear())
        .then(_ => articles.db.getLastModified())
        .should.eventually.eql(null);
    });

    it("should clear collection metadata", () => {
      return articles
        .clear()
        .then(_ => articles.metadata())
        .should.eventually.eql(null);
    });
  });

  /** @test {Collection#create} */
  describe("#create", () => {
    let articles;

    beforeEach(() => (articles = testCollection()));

    it("should create a record and return created record data", () => {
      return articles.create(article).should.eventually.have.property("data");
    });

    it("should create a record and return created record perms", () => {
      return articles
        .create(article)
        .should.eventually.have.property("permissions");
    });

    it("should assign an id to the created record", () => {
      return articles
        .create(article)
        .then(result => result.data.id)
        .should.eventually.be.a("string");
    });

    it("should assign an id to the created record (custom IdSchema)", () => {
      articles = testCollection({ idSchema: createIntegerIdSchema() });

      return articles
        .create(article)
        .then(result => result.data.id)
        .should.eventually.be.a("number");
    });

    it("should accept a record for the 'generate' function", () => {
      articles = testCollection({ idSchema: createKeyListIdSchema() });

      return articles
        .create(article)
        .then(result => result.data.id)
        .should.eventually.eql("title,url");
    });

    it("should reject when useRecordId is true and record is missing an id", () => {
      return articles
        .create({ title: "foo" }, { useRecordId: true })
        .should.be.rejectedWith(Error, /Missing required Id/);
    });

    it("should reject when synced is true and record is missing an id", () => {
      return articles
        .create({ title: "foo" }, { synced: true })
        .should.be.rejectedWith(Error, /Missing required Id/);
    });

    it("should reject when passed an id and synced and useRecordId are false", () => {
      return articles
        .create({ id: "some-id" }, { synced: false, useRecordId: false })
        .should.be.rejectedWith(Error, /Extraneous Id/);
    });

    it("should not alter original record", () => {
      return articles.create(article).should.eventually.not.eql(article);
    });

    it("should add record status on creation", () => {
      return articles
        .create(article)
        .then(res => res.data._status)
        .should.eventually.eql("created");
    });

    it("should reject if passed argument is not an object", () => {
      return articles
        .create(42)
        .should.eventually.be.rejectedWith(Error, /is not an object/);
    });

    it("should actually persist the record into the collection", () => {
      return articles
        .create(article)
        .then(result => articles.get(result.data.id))
        .then(res => res.data.title)
        .should.become(article.title);
    });

    it("should support the useRecordId option", () => {
      const testId = uuid4();
      return articles
        .create({ id: testId, title: "foo" }, { useRecordId: true })
        .then(result => articles.get(result.data.id))
        .then(res => res.data.id)
        .should.become(testId);
    });

    it("should validate record's Id when provided", () => {
      return articles
        .create({ id: "a/b", title: "foo" }, { useRecordId: true })
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should validate record's Id when provided (custom IdSchema)", () => {
      articles = testCollection({ idSchema: createIntegerIdSchema() });

      return articles
        .create({ id: "deadbeef", title: "foo" }, { useRecordId: true })
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should reject with any encountered transaction error", () => {
      sandbox
        .stub(articles.db, "execute")
        .returns(Promise.reject(new Error("transaction error")));

      return articles
        .create({ title: "foo" })
        .should.be.rejectedWith(Error, /transaction error/);
    });

    it("should reject with a hint if useRecordId has been used", () => {
      return articles
        .create({ id: uuid4() }, { useRecordId: true })
        .then(res => articles.delete(res.data.id))
        .then(res =>
          articles.create({ id: res.data.id }, { useRecordId: true })
        )
        .should.be.rejectedWith(Error, /virtually deleted/);
    });

    it("should throw error when using createKeyValueStoreIdSchema.generate", () => {
      articles = testCollection({ idSchema: createKeyValueStoreIdSchema() });
      expect(() => articles.create(article)).to.throw(
        "createKeyValueStoreIdSchema() does not generate an id"
      );
    });

    it("should return true when using createKeyValueStoreIdSchema.validate", () => {
      articles = testCollection({ idSchema: createKeyValueStoreIdSchema() });
      return articles
        .create({ ...article, id: article.title }, { useRecordId: true })
        .then(result => articles.getAny(result.data.id))
        .then(result => result.data.id)
        .should.become(article.title);
    });
  });

  /** @test {Collection#update} */
  describe("#update", () => {
    let articles;

    beforeEach(() => (articles = testCollection({ localFields: ["read"] })));

    it("should update a record", () => {
      return articles
        .create(article)
        .then(res => articles.get(res.data.id))
        .then(res => res.data)
        .then(existing => {
          return articles.update({ ...existing, title: "new title" });
        })
        .then(res => articles.get(res.data.id))
        .then(res => res.data.title)
        .should.become("new title");
    });

    it("should return the old data for the record", () => {
      return articles
        .create(article)
        .then(res => articles.get(res.data.id))
        .then(res => res.data)
        .then(existing => {
          return articles.update({ ...existing, title: "new title" });
        })
        .then(res => res.oldRecord.title)
        .should.become("foo");
    });

    it("should update record status on update", () => {
      return articles
        .create({ id: uuid4() }, { synced: true })
        .then(res => res.data)
        .then(data => articles.update({ ...data, title: "blah" }))
        .then(res => res.data._status)
        .should.eventually.eql("updated");
    });

    it("should not update record status if only local fields are changed", () => {
      return articles
        .create({ id: uuid4() }, { synced: true })
        .then(res => res.data)
        .then(data => articles.update({ ...data, read: true }))
        .then(res => res.data._status)
        .should.eventually.eql("synced");
    });

    it("should reject updates on a non-existent record", () => {
      return articles
        .update({ id: uuid4() })
        .should.be.rejectedWith(Error, /not found/);
    });

    it("should reject updates on a non-object record", () => {
      return articles
        .update("invalid")
        .should.be.rejectedWith(Error, /Record is not an object/);
    });

    it("should reject updates on a record without an id", () => {
      return articles
        .update({ title: "foo" })
        .should.be.rejectedWith(Error, /missing id/);
    });

    it("should validate record's id when provided", () => {
      return articles
        .update({ id: 42 })
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should validate record's id when provided (custom IdSchema)", () => {
      articles = testCollection({ idSchema: createIntegerIdSchema() });

      return articles
        .update({ id: "deadbeef" })
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should update a record from its id (custom IdSchema)", () => {
      articles = testCollection({ idSchema: createIntegerIdSchema() });

      return articles
        .create(article)
        .then(result => articles.update({ id: result.data.id, title: "foo" }))
        .then(res => res.data.title)
        .should.eventually.eql("foo");
    });

    it("should patch existing record when patch option is used", () => {
      const id = uuid4();
      return articles
        .create(
          { id, title: "foo", last_modified: 42 },
          { useRecordId: true, synced: true }
        )
        .then(() => articles.update({ id, rank: 99 }, { patch: true }))
        .then(res => res.data)
        .should.eventually.become({
          id,
          title: "foo",
          rank: 99,
          last_modified: 42,
          _status: "updated",
        });
    });

    it("should remove previous record fields", () => {
      return articles
        .create(article)
        .then(res => articles.get(res.data.id))
        .then(res => {
          return articles.update({ id: res.data.id, title: "new title" });
        })
        .then(res => res.data)
        .should.eventually.not.have.property("url");
    });

    it("should preserve record.last_modified", () => {
      return articles
        .create({
          title: "foo",
          url: "http://foo",
          last_modified: 123456789012,
        })
        .then(res => articles.get(res.data.id))
        .then(res => {
          return articles.update({ id: res.data.id, title: "new title" });
        })
        .then(res => res.data)
        .should.eventually.have.property("last_modified")
        .eql(123456789012);
    });

    it("should optionally mark a record as synced", () => {
      return articles
        .create({ title: "foo" })
        .then(res =>
          articles.update({ ...res.data, title: "bar" }, { synced: true })
        )
        .then(res => res.data)
        .should.eventually.have.property("_status")
        .eql("synced");
    });

    it("should preserve created status if record was never synced", () => {
      return articles
        .create({ title: "foo" })
        .then(res =>
          articles.update(Object.assign({}, res.data, { title: "bar" }))
        )
        .then(res => res.data)
        .should.eventually.have.property("_status")
        .eql("created");
    });
  });

  /** @test {Collection#put} */
  describe("#put", () => {
    let articles;

    beforeEach(() => (articles = testCollection()));

    it("should update a record", () => {
      return articles
        .create(article)
        .then(res => articles.get(res.data.id))
        .then(res => res.data)
        .then(existing => {
          return articles.upsert({ ...existing, title: "new title" });
        })
        .then(res => articles.get(res.data.id))
        .then(res => res.data.title)
        .should.become("new title");
    });

    it("should change record status to updated", () => {
      return articles
        .create({ id: uuid4() }, { synced: true })
        .then(res => res.data)
        .then(data => articles.upsert({ ...data, title: "blah" }))
        .then(res => res.data._status)
        .should.eventually.eql("updated");
    });

    it("should preserve created status if record was never synced", () => {
      return articles
        .create({ title: "foo" })
        .then(res =>
          articles.upsert(Object.assign({}, res.data, { title: "bar" }))
        )
        .then(res => res.data)
        .should.eventually.have.property("_status")
        .eql("created");
    });

    it("should create a new record if non-existent", () => {
      return articles
        .upsert({ id: uuid4(), title: "new title" })
        .then(res => res.data.title)
        .should.eventually.become("new title");
    });

    it("should set status to created if it created a record", () => {
      return articles
        .upsert({ id: uuid4() })
        .then(res => res.data._status)
        .should.eventually.become("created");
    });

    it("should reject updates on a non-object record", () => {
      return articles
        .upsert("invalid")
        .should.be.rejectedWith(Error, /Record is not an object/);
    });

    it("should reject updates on a record without an id", () => {
      return articles
        .upsert({ title: "foo" })
        .should.be.rejectedWith(Error, /missing id/);
    });

    it("should validate record's id when provided", () => {
      return articles
        .upsert({ id: 42 })
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should update deleted records", () => {
      return articles
        .create(article)
        .then(res => articles.get(res.data.id))
        .then(res => articles.delete(res.data.id))
        .then(res => articles.upsert({ ...res.data, title: "new title" }))
        .then(res => res.data.title)
        .should.eventually.become("new title");
    });

    it("should set status of deleted records to updated", () => {
      return articles
        .create(article)
        .then(res => articles.get(res.data.id))
        .then(res => articles.delete(res.data.id))
        .then(res => articles.upsert({ ...res.data, title: "new title" }))
        .then(res => res.data._status)
        .should.eventually.become("updated");
    });

    it("should validate record's id when provided (custom IdSchema)", () => {
      articles = testCollection({ idSchema: createIntegerIdSchema() });

      return articles
        .upsert({ id: "deadbeef" })
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should remove previous record fields", () => {
      return articles
        .create(article)
        .then(res => articles.get(res.data.id))
        .then(res => {
          return articles.upsert({ id: res.data.id, title: "new title" });
        })
        .then(res => res.data)
        .should.eventually.not.have.property("url");
    });

    it("should preserve record.last_modified", () => {
      return articles
        .create({
          title: "foo",
          url: "http://foo",
          last_modified: 123456789012,
        })
        .then(res => articles.get(res.data.id))
        .then(res => {
          return articles.upsert({ id: res.data.id, title: "new title" });
        })
        .then(res => res.data)
        .should.eventually.have.property("last_modified")
        .eql(123456789012);
    });

    it("should return the old data for the record", () => {
      return articles
        .create(article)
        .then(res => articles.get(res.data.id))
        .then(res => res.data)
        .then(existing => {
          return articles.upsert({ ...existing, title: "new title" });
        })
        .then(res => res.oldRecord.title)
        .should.become("foo");
    });

    it("should not return the old data for a deleted record", () => {
      let articleId;
      return articles
        .create(article)
        .then(res => {
          articleId = res.data.id;
          return articles.delete(articleId);
        })
        .then(res => articles.upsert({ id: articleId, title: "new title" }))
        .then(res => res.oldRecord)
        .should.become(undefined);
    });

    it("should signal when a record was created by oldRecord=undefined", () => {
      return articles
        .upsert({ id: uuid4() })
        .then(res => res.oldRecord)
        .should.become(undefined);
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
    let articles, local, remote, conflict;

    beforeEach(() => {
      articles = testCollection();
      return articles
        .create(
          { id: uuid4(), title: "local title", last_modified: 41 },
          { synced: true }
        )
        .then(res => {
          local = res.data;
          remote = {
            ...local,
            title: "blah",
            last_modified: 42,
          };
          conflict = {
            type: "incoming",
            local: local,
            remote: remote,
          };
        });
    });

    it("should mark a record as updated", () => {
      const resolution = { ...local, title: "resolved" };
      return articles
        .resolve(conflict, resolution)
        .then(res => res.data)
        .should.eventually.become({
          _status: "updated",
          id: local.id,
          title: resolution.title,
          last_modified: remote.last_modified,
        });
    });

    it("should mark a record as synced if resolved with remote", () => {
      const resolution = { ...local, title: remote.title };
      return articles
        .resolve(conflict, resolution)
        .then(res => res.data)
        .should.eventually.become({
          _status: "synced",
          id: local.id,
          title: resolution.title,
          last_modified: remote.last_modified,
        });
    });
  });

  /** @test {Collection#get} */
  describe("#get", () => {
    let articles, id;

    beforeEach(() => {
      articles = testCollection();
      return articles.create(article).then(result => (id = result.data.id));
    });

    it("should isolate records by bucket", () => {
      const otherbucket = new Collection("other", TEST_COLLECTION_NAME, {
        api,
      });
      return otherbucket
        .get(id)
        .then(res => res.data)
        .should.be.rejectedWith(Error, /not found/);
    });

    it("should retrieve a record from its id", () => {
      return articles
        .get(id)
        .then(res => res.data.title)
        .should.eventually.eql(article.title);
    });

    it("should retrieve a record from its id (custom IdSchema)", () => {
      articles = testCollection({ idSchema: createIntegerIdSchema() });

      // First, get rid of the old record with the ID from the other ID schema
      return articles
        .clear()
        .then(() => articles.create(article))
        .then(result => articles.get(result.data.id))
        .then(res => res.data.title)
        .should.eventually.eql(article.title);
    });

    it("should validate passed id", () => {
      return articles.get(42).should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should validate passed id (custom IdSchema)", () => {
      return articles
        .get("dead.beef")
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should have record status info attached", () => {
      return articles
        .get(id)
        .then(res => res.data._status)
        .should.eventually.eql("created");
    });

    it("should reject in case of record not found", () => {
      return articles
        .get(uuid4())
        .then(res => res.data)
        .should.be.rejectedWith(Error, /not found/);
    });

    it("should reject on virtually deleted record", () => {
      return articles
        .delete(id)
        .then(res => articles.get(id))
        .then(res => res.data)
        .should.be.rejectedWith(Error, /not found/);
    });

    it("should retrieve deleted record with includeDeleted", () => {
      return articles
        .delete(id)
        .then(res => articles.get(id, { includeDeleted: true }))
        .then(res => res.data)
        .should.eventually.become({
          _status: "deleted",
          id: id,
          title: "foo",
          url: "http://foo",
        });
    });
  });

  /** @test {Collection#getAny} */
  describe("#getAny", () => {
    let articles, id;

    beforeEach(() => {
      articles = testCollection();
      return articles.create(article).then(result => (id = result.data.id));
    });

    it("should retrieve a record from its id", () => {
      return articles
        .getAny(id)
        .then(res => res.data.title)
        .should.eventually.eql(article.title);
    });

    it("should resolve to undefined if not present", () => {
      return articles
        .getAny(uuid4())
        .then(res => res.data)
        .should.eventually.eql(undefined);
    });

    it("should resolve to virtually deleted record", () => {
      return articles
        .delete(id)
        .then(res => articles.getAny(id))
        .then(res => res.data)
        .should.eventually.become({
          _status: "deleted",
          id: id,
          title: "foo",
          url: "http://foo",
        });
    });
  });

  /** @test {Collection#delete} */
  describe("#delete", () => {
    let articles, id;

    beforeEach(() => {
      articles = testCollection();
      return articles.create(article).then(result => (id = result.data.id));
    });

    it("should validate passed id", () => {
      return articles.delete(42).should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should validate passed id (custom IdSchema)", () => {
      return articles
        .delete("dead beef")
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    describe("Virtual", () => {
      it("should virtually delete a record", () => {
        return articles
          .delete(id, { virtual: true })
          .then(res => articles.get(res.data.id, { includeDeleted: true }))
          .then(res => res.data._status)
          .should.eventually.eql("deleted");
      });

      it("should reject on non-existent record", () => {
        return articles
          .delete(uuid4(), { virtual: true })
          .then(res => res.data)
          .should.eventually.be.rejectedWith(Error, /not found/);
      });

      it("should reject on already deleted record", () => {
        return articles
          .delete(id, { virtual: true })
          .then(res => articles.delete(id, { virtual: true }))
          .should.eventually.be.rejectedWith(Error, /not found/);
      });

      it("should return deleted record", () => {
        return articles
          .delete(id, { virtual: true })
          .then(res => res.data)
          .should.eventually.have.property("title")
          .eql("foo");
      });
    });

    describe("Factual", () => {
      it("should factually delete a record", () => {
        return articles
          .delete(id, { virtual: false })
          .then(res => articles.get(res.data.id))
          .should.eventually.be.rejectedWith(Error, /not found/);
      });

      it("should resolve with deletion information", () => {
        return articles
          .delete(id, { virtual: false })
          .then(res => res.data)
          .should.eventually.have.property("id")
          .eql(id);
      });

      it("should reject on non-existent record", () => {
        return articles
          .delete(uuid4(), { virtual: false })
          .then(res => res.data)
          .should.eventually.be.rejectedWith(Error, /not found/);
      });

      it("should delete if already virtually deleted", () => {
        return articles
          .delete(id)
          .then(_ => articles.delete(id, { virtual: false }))
          .then(res => res.data)
          .should.eventually.have.property("id")
          .eql(id);
      });

      it("should return deleted record", () => {
        return articles
          .delete(id, { virtual: false })
          .then(res => res.data)
          .should.eventually.have.property("title")
          .eql("foo");
      });
    });
  });

  /** @test {Collection#deleteAll} */
  describe("#deleteAll", () => {
    let articles;

    beforeEach(() => {
      //Create 5 Records
      articles = testCollection();
      articles.create(article);
      articles.create(article);
      articles.create(article);
      articles.create(article);
      articles.create(article);
      return articles;
    });

    it("should be able to soft delete all articles", () => {
      return articles
        .deleteAll()
        .then(res => articles.list())
        .then(res => res.data)
        .should.eventually.have.length.of(0)
        .then(() => articles.list({}, { includeDeleted: true }))
        .then(res => res.data)
        .should.eventually.have.length.of(5);
    });

    it("should not delete anything when there are no records", () => {
      return articles
        .clear()
        .then(res => articles.deleteAll())
        .then(res => res.data)
        .should.eventually.have.length.of(0);
    });
  });

  /** @test {Collection#deleteAny} */
  describe("#deleteAny", () => {
    let articles, id;

    beforeEach(() => {
      articles = testCollection();
      return articles.create(article).then(result => (id = result.data.id));
    });

    it("should delete an existing record", () => {
      return articles
        .deleteAny(id)
        .then(res => articles.getAny(res.data.id))
        .then(res => res.data._status)
        .should.eventually.eql("deleted");
    });

    it("should resolve on non-existant record", () => {
      const id = uuid4();
      return articles
        .deleteAny(id)
        .then(res => res.data.id)
        .should.eventually.eql(id);
    });

    it("should indicate that it deleted", () => {
      return articles
        .deleteAny(id)
        .then(res => res.deleted)
        .should.eventually.eql(true);
    });

    it("should indicate that it didn't delete when record is gone", () => {
      const id = uuid4();
      return articles
        .deleteAny(id)
        .then(res => res.deleted)
        .should.eventually.eql(false);
    });

    it("should return deleted record", () => {
      return articles
        .deleteAny(id)
        .then(res => res.data)
        .should.eventually.have.property("title")
        .eql("foo");
    });
  });

  /** @test {Collection#list} */
  describe("#list", () => {
    let articles;

    describe("Basic", () => {
      beforeEach(() => {
        articles = testCollection();
        return Promise.all([
          articles.create(article),
          articles.create({ title: "bar", url: "http://bar" }),
        ]);
      });

      it("should retrieve the list of records", () => {
        return articles
          .list()
          .then(res => res.data)
          .should.eventually.have.length.of(2);
      });

      it("shouldn't list virtually deleted records", () => {
        return articles
          .create({ title: "yay" })
          .then(res => articles.delete(res.data.id))
          .then(_ => articles.list())
          .then(res => res.data)
          .should.eventually.have.length.of(2);
      });

      it("should support the includeDeleted option", () => {
        return articles
          .create({ title: "yay" })
          .then(res => articles.delete(res.data.id))
          .then(_ => articles.list({}, { includeDeleted: true }))
          .then(res => res.data)
          .should.eventually.have.length.of(3);
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
        return Promise.all(fixtures.map(r => articles.create(r)));
      });

      it("should order records on last_modified DESC by default", () => {
        return articles
          .list()
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art2", "art1", "art3"]);
      });

      it("should order records on custom field ASC", () => {
        return articles
          .list({ order: "title" })
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art1", "art2", "art3"]);
      });

      it("should order records on custom field DESC", () => {
        return articles
          .list({ order: "-title" })
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art3", "art2", "art1"]);
      });

      it("should order records on boolean values ASC", () => {
        return articles
          .list({ order: "unread" })
          .then(res => res.data.map(r => r.unread))
          .should.eventually.become([false, false, true]);
      });

      it("should order records on boolean values DESC", () => {
        return articles
          .list({ order: "-unread" })
          .then(res => res.data.map(r => r.unread))
          .should.eventually.become([true, false, false]);
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

      it("should filter records on indexed fields", () => {
        return articles
          .list({ filters: { _status: "created" } })
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art1", "art2"]);
      });

      it("should filter records on existing field", () => {
        return articles
          .list({ filters: { unread: true } })
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art1", "art3"]);
      });

      it("should filter records on missing field", () => {
        return articles
          .list({ filters: { missing: true } })
          .then(res => res.data.map(r => r.title))
          .should.eventually.become([]);
      });

      it("should filter records on multiple fields using 'and'", () => {
        return articles
          .list({ filters: { unread: true, complete: true } })
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art1"]);
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
        return Promise.all(fixtures.map(r => articles.create(r)));
      });

      it("Filters nested objects", () => {
        return articles
          .list({
            filters: {
              "author.name": "John",
              "author.otherBook.title": "book3",
            },
          })
          .then(res => {
            return res.data.map(r => {
              return r.title;
            });
          })
          .should.eventually.become(["art3"]);
      });

      it("should return empty array if missing subObject field", () => {
        return articles
          .list({
            filters: {
              "author.name": "John",
              "author.unknownField": "blahblahblah",
            },
          })
          .then(res => res.data)
          .should.eventually.become([]);
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
        return Promise.all(fixtures.map(r => articles.create(r)));
      });

      it("should order and filter records", () => {
        return articles
          .list({ order: "-title", filters: { unread: true, complete: true } })
          .then(res =>
            res.data.map(r => {
              return { title: r.title, unread: r.unread, complete: r.complete };
            })
          )
          .should.eventually.become([
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
    let articles;

    it("should call importBulk", () => {
      articles = testCollection();
      sandbox.stub(articles, "importBulk").returns(Promise.resolve());
      articles
        .loadDump([
          { id: uuid4(), title: "foo", last_modified: 1452347896 },
          { id: uuid4(), title: "bar", last_modified: 1452347985 },
        ])
        .then(_ => sinon.assert.calledOnce(articles.importBulk));
    });
  });

  /** @test {Collection#importBulk} */
  describe("#importBulk", () => {
    let articles;

    beforeEach(() => (articles = testCollection()));

    it("should import records in the collection", () => {
      return articles
        .importBulk([
          { id: uuid4(), title: "foo", last_modified: 1452347896 },
          { id: uuid4(), title: "bar", last_modified: 1452347985 },
        ])
        .should.eventually.have.length(2);
    });

    it("should fail if records is not an array", () => {
      return articles
        .importBulk({ id: "abc", title: "foo" })
        .should.be.rejectedWith(Error, /^Records is not an array./);
    });

    it("should fail if id is invalid", () => {
      return articles
        .importBulk([{ id: "a.b.c", title: "foo" }])
        .should.be.rejectedWith(Error, /^Record has invalid ID./);
    });

    it("should fail if id is missing", () => {
      return articles
        .importBulk([{ title: "foo" }])
        .should.be.rejectedWith(Error, /^Record has invalid ID./);
    });

    it("should fail if last_modified is missing", () => {
      return articles
        .importBulk([{ id: uuid4(), title: "foo" }])
        .should.be.rejectedWith(Error, /^Record has no last_modified value./);
    });

    it("should mark imported records as synced.", () => {
      const testId = uuid4();
      return articles
        .importBulk([{ id: testId, title: "foo", last_modified: 1457896541 }])
        .then(() => {
          return articles.get(testId);
        })
        .then(res => res.data._status)
        .should.eventually.eql("synced");
    });

    it("should ignore already imported records.", () => {
      const record = { id: uuid4(), title: "foo", last_modified: 1457896541 };
      return articles
        .importBulk([record])
        .then(() => articles.importBulk([record]))
        .should.eventually.have.length(0);
    });

    it("should overwrite old records.", () => {
      const record = {
        id: "a-record",
        title: "foo",
        last_modified: 1457896541,
      };
      return articles
        .importBulk([record])
        .then(() => {
          const updated = { ...record, last_modified: 1457896543 };
          return articles.importBulk([updated]);
        })
        .should.eventually.have.length(1);
    });

    it("should not overwrite unsynced records.", () => {
      return articles
        .create({ title: "foo" })
        .then(result => {
          const record = {
            id: result.data.id,
            title: "foo",
            last_modified: 1457896541,
          };
          return articles.importBulk([record]);
        })
        .should.eventually.have.length(0);
    });

    it("should not overwrite records without last modified.", () => {
      return articles
        .create({ id: uuid4(), title: "foo" }, { synced: true })
        .then(result => {
          const record = {
            id: result.data.id,
            title: "foo",
            last_modified: 1457896541,
          };
          return articles.importBulk([record]);
        })
        .should.eventually.have.length(0);
    });
  });

  /** @test {Collection#gatherLocalChanges} */
  describe("#gatherLocalChanges", () => {
    let articles;

    beforeEach(() => {
      articles = testCollection();
      return Promise.all([
        articles.create({ title: "abcdef" }),
        articles.create({ title: "ghijkl" }),
      ]);
    });

    describe("transformers", () => {
      it("should asynchronously encode records", () => {
        articles = testCollection({
          remoteTransformers: [
            createEncodeTransformer("?", 10),
            createEncodeTransformer("!", 5),
          ],
        });

        return articles
          .gatherLocalChanges()
          .then(res => res.map(r => r.title).sort())
          .should.become(["abcdef?!", "ghijkl?!"]);
      });

      it("should encode even deleted records", () => {
        const transformer = {
          called: false,
          encode(record) {
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
        return articles
          .create({ id: id, title: "some title" }, { synced: true })
          .then(() => {
            return articles.delete(id);
          })
          .then(() => articles.gatherLocalChanges())
          .then(changes => {
            expect(transformer.called).equal(true);
            expect(
              changes.filter(change => change._status == "deleted")[0]
            ).property("id", "remote-" + id);
          });
      });
    });
  });

  /** @test {Collection#pullChanges} */
  describe("#pullChanges", () => {
    let client, articles, listRecords, result;

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
      const serverChanges = [
        { id: id_2, title: "art2" }, // existing & untouched, skipped
        { id: id_3, title: "art3" }, // to be created
        { id: id_4, deleted: true }, // to be deleted
        { id: id_6, deleted: true }, // remotely deleted & missing locally, skipped
        { id: id_7, title: "art7-b" }, // remotely conflicting
        { id: id_8, title: "art8" }, // to be created
        { id: id_9, deleted: true }, // remotely deleted & deleted locally, skipped
      ];

      beforeEach(() => {
        listRecords = sandbox
          .stub(KintoClientCollection.prototype, "listRecords")
          .returns(
            Promise.resolve({
              data: serverChanges,
              next: () => {},
              last_modified: "42",
            })
          );
        client = new KintoClient("http://server.com/v1")
          .bucket("bucket")
          .collection("collection");
        return Promise.all(
          localData.map(fixture => {
            return articles.create(fixture, { synced: true });
          })
        ).then(_ => {
          return articles.delete(id_9);
        });
      });

      describe("incoming changes hook", () => {
        it("should be called", () => {
          let hookCalled = false;
          articles = testCollection({
            hooks: {
              "incoming-changes": [
                function(payload) {
                  hookCalled = true;
                  return payload;
                },
              ],
            },
          });

          return articles
            .pullChanges(client, result)
            .then(_ => expect(hookCalled).to.eql(true));
        });

        it("should reject the promise if the hook throws", () => {
          articles = testCollection({
            hooks: {
              "incoming-changes": [
                function(changes) {
                  throw new Error("Invalid collection data");
                },
              ],
            },
          });

          return articles
            .pullChanges(client, result)
            .should.eventually.be.rejectedWith(
              Error,
              /Invalid collection data/
            );
        });

        it("should use the results of the hooks", () => {
          articles = testCollection({
            hooks: {
              "incoming-changes": [
                function(incoming) {
                  const newChanges = incoming.changes.map(r => ({
                    ...r,
                    foo: "bar",
                  }));
                  return { ...incoming, changes: newChanges };
                },
              ],
            },
          });

          return articles.pullChanges(client, result).then(result => {
            expect(result.created.length).to.eql(2);
            result.created.forEach(r => {
              expect(r.foo).to.eql("bar");
            });
            expect(result.updated.length).to.eql(2);
            result.updated.forEach(r => {
              expect(r.new.foo).to.eql("bar");
            });
          });
        });

        it("should be able to chain hooks", () => {
          function hookFactory(fn) {
            return function(incoming) {
              const returnedChanges = incoming;
              const newChanges = returnedChanges.changes.map(fn);
              return { ...incoming, newChanges };
            };
          }
          articles = testCollection({
            hooks: {
              // N.B. This only works because it's mutating serverChanges
              "incoming-changes": [
                hookFactory(r => {
                  r.foo = "bar";
                  return r;
                }),
                hookFactory(r => {
                  r.bar = "baz";
                  return r;
                }),
              ],
            },
          });

          return articles.pullChanges(client, result).then(result => {
            expect(result.created.length).to.eql(2);
            result.created.forEach(r => {
              expect(r.foo).to.eql("bar");
              expect(r.bar).to.eql("baz");
            });
            expect(result.updated.length).to.eql(2);
            result.updated.forEach(r => {
              expect(r.new.foo).to.eql("bar");
              expect(r.new.bar).to.eql("baz");
            });
          });
        });

        it("should pass the collection as the second argument", () => {
          let passedCollection = null;
          articles = testCollection({
            hooks: {
              "incoming-changes": [
                function(payload, collection) {
                  passedCollection = collection;
                  return payload;
                },
              ],
            },
          });

          return articles.pullChanges(client, result).then(_ => {
            expect(passedCollection).to.eql(articles);
          });
        });

        it("should reject if the hook returns something strange", () => {
          articles = testCollection({
            hooks: {
              "incoming-changes": [() => 42],
            },
          });
          return articles
            .pullChanges(client, result)
            .should.eventually.be.rejectedWith(
              Error,
              /Invalid return value for hook: 42 has no 'then\(\)' or 'changes' properties/
            );
        });

        it("should resolve if the hook returns a promise", () => {
          articles = testCollection({
            hooks: {
              "incoming-changes": [
                payload => {
                  const newChanges = payload.changes.map(r => ({
                    ...r,
                    foo: "bar",
                  }));
                  return Promise.resolve({ ...payload, changes: newChanges });
                },
              ],
            },
          });
          return articles.pullChanges(client, result).then(result => {
            expect(result.created.length).to.eql(2);
            result.created.forEach(r => {
              expect(r.foo).to.eql("bar");
            });
          });
        });
      });

      describe("With transformers", () => {
        function createDecodeTransformer(char) {
          return {
            encode() {},
            decode(record) {
              return { ...record, title: record.title + char };
            },
          };
        }

        beforeEach(() => {
          return listRecords.returns(
            Promise.resolve({
              data: [{ id: uuid4(), title: "bar" }],
              next: () => {},
              last_modified: "42",
            })
          );
        });

        it("should decode incoming encoded records using a single transformer", () => {
          articles = testCollection({
            remoteTransformers: [createDecodeTransformer("#")],
          });

          return articles
            .pullChanges(client, result)
            .then(res => res.created[0].title)
            .should.become("bar#");
        });

        it("should decode incoming encoded records using multiple transformers", () => {
          articles = testCollection({
            remoteTransformers: [
              createDecodeTransformer("!"),
              createDecodeTransformer("?"),
            ],
          });

          return articles
            .pullChanges(client, result)
            .then(res => res.created[0].title)
            .should.become("bar?!"); // reversed because we decode in the opposite order
        });

        it("should decode incoming records even when deleted", () => {
          const transformer = {
            called: false,
            encode() {},
            decode(record) {
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
              data: [{ id: id, deleted: true }],
              next: () => {},
              last_modified: "42",
            })
          );
          return articles
            .create(
              { id: "local-" + id, title: "some title" },
              { synced: true }
            )
            .then(() => articles.pullChanges(client, result))
            .then(res => {
              expect(transformer.called).equal(true);
              return res.deleted[0];
            })
            .should.eventually.property("id", "local-" + id);
        });
      });

      it("should not fetch remote records if result status isn't ok", () => {
        const withConflicts = new SyncResultObject();
        withConflicts.add("conflicts", [1]);
        return articles
          .pullChanges(client, withConflicts)
          .then(_ => sinon.assert.notCalled(listRecords));
      });

      it("should fetch remote changes from the server", () => {
        return articles.pullChanges(client, result).then(_ => {
          sinon.assert.calledOnce(listRecords);
          sinon.assert.calledWithExactly(listRecords, {
            since: undefined,
            filters: undefined,
            retry: undefined,
            pages: Infinity,
            headers: {},
          });
        });
      });

      it("should use timestamp to fetch remote changes from the server", () => {
        return articles
          .pullChanges(client, result, { lastModified: 42 })
          .then(_ => {
            sinon.assert.calledOnce(listRecords);
            sinon.assert.calledWithExactly(listRecords, {
              since: "42",
              filters: undefined,
              retry: undefined,
              pages: Infinity,
              headers: {},
            });
          });
      });

      it("should pass provided filters when polling changes from server", () => {
        const exclude = [{ id: 1 }, { id: 2 }, { id: 3 }];
        return articles
          .pullChanges(client, result, { lastModified: 42, exclude })
          .then(_ => {
            sinon.assert.calledOnce(listRecords);
            sinon.assert.calledWithExactly(listRecords, {
              since: "42",
              filters: { exclude_id: "1,2,3" },
              retry: undefined,
              pages: Infinity,
              headers: {},
            });
          });
      });

      it("should respect expectedTimestamp when requesting changes", () => {
        return articles
          .pullChanges(client, result, { expectedTimestamp: '"123"' })
          .then(_ => {
            sinon.assert.calledOnce(listRecords);
            sinon.assert.calledWithExactly(listRecords, {
              since: undefined,
              filters: { _expected: '"123"' },
              retry: undefined,
              pages: Infinity,
              headers: {},
            });
          });
      });

      it("should resolve with imported creations", () => {
        return articles
          .pullChanges(client, result)
          .then(res => res.created)
          .should.eventually.become([
            { id: id_3, title: "art3", _status: "synced" },
            { id: id_8, title: "art8", _status: "synced" },
          ]);
      });

      it("should resolve with imported updates", () => {
        return articles
          .pullChanges(client, result)
          .then(res => res.updated)
          .should.eventually.become([
            {
              old: { id: id_7, title: "art7-a", _status: "synced" },
              new: { id: id_7, title: "art7-b", _status: "synced" },
            },
          ]);
      });

      it("should resolve with imported deletions", () => {
        return articles
          .pullChanges(client, result)
          .then(res => res.deleted)
          .should.eventually.become([
            { id: id_4, title: "art4", _status: "synced" },
          ]);
      });

      it("should resolve with no conflicts detected", () => {
        return articles
          .pullChanges(client, result)
          .then(res => res.conflicts)
          .should.eventually.become([]);
      });

      it("should actually import changes into the collection", () => {
        return articles
          .pullChanges(client, result)
          .then(_ => articles.list({ order: "title" }))
          .then(res => res.data)
          .should.eventually.become([
            { id: id_1, title: "art1", _status: "synced" },
            { id: id_2, title: "art2", _status: "synced" },
            { id: id_3, title: "art3", _status: "synced" },
            { id: id_5, title: "art5", _status: "synced" },
            { id: id_7, title: "art7-b", _status: "synced" },
            { id: id_8, title: "art8", _status: "synced" },
          ]);
      });

      it("should skip deleted data missing locally", () => {
        return articles.pullChanges(client, result).then(res => {
          expect(res.skipped).eql([
            { id: id_6, deleted: true },
            { id: id_9, title: "art9", _status: "deleted" },
          ]);
        });
      });

      it("should not list identical records as skipped", () => {
        return articles
          .pullChanges(client, result)
          .then(res => res.skipped)
          .should.eventually.not.contain({
            id: id_2,
            title: "art2",
            _status: "synced",
          });
      });

      describe("Error handling", () => {
        it("should expose any import transaction error", () => {
          const error = new Error("bad");
          sandbox.stub(articles.db, "execute").returns(Promise.reject(error));

          return articles
            .pullChanges(client, result)
            .then(res => res.errors)
            .should.become([
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
      let createdId, local;

      beforeEach(() => {
        return articles.create({ title: "art2" }).then(res => {
          local = res.data;
          createdId = local.id;
        });
      });

      it("should resolve listing conflicting changes with MANUAL strategy", () => {
        sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
          Promise.resolve({
            data: [
              { id: createdId, title: "art2mod", last_modified: 42 }, // will conflict with unsynced local record
            ],
            next: () => {},
            last_modified: "42",
          })
        );

        return articles
          .pullChanges(client, result)
          .then(result => result.toObject())
          .should.eventually.become({
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

      it("should ignore resolved conflicts during sync", () => {
        const remote = { ...local, title: "blah", last_modified: 42 };
        const conflict = { type: "incoming", local: local, remote: remote };
        const resolution = { ...local, title: "resolved" };
        sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
          Promise.resolve({
            data: [remote],
            next: () => {},
            last_modified: "42",
          })
        );
        const syncResult = new SyncResultObject();
        return articles
          .resolve(conflict, resolution)
          .then(() => articles.pullChanges(client, syncResult))
          .then(result => result.toObject())
          .should.eventually.become({
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
      let createdId;

      beforeEach(() => {
        return articles.create({ title: "art2" }).then(res => {
          createdId = res.data.id;
          sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
            Promise.resolve({
              data: [
                { id: createdId, title: "art2" }, // resolvable conflict
              ],
              next: () => {},
              last_modified: "42",
            })
          );
        });
      });

      it("should resolve with solved changes", () => {
        return articles
          .pullChanges(client, result)
          .then(result => result.toObject())
          .should.eventually.become({
            ok: true,
            lastModified: 42,
            errors: [],
            created: [],
            published: [],
            updated: [
              {
                old: { id: createdId, title: "art2", _status: "created" },
                new: { id: createdId, title: "art2", _status: "synced" },
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
    let articles, result;

    beforeEach(() => {
      articles = testCollection();
      result = new SyncResultObject();
    });

    it("should return errors when encountered", () => {
      const error = new Error("unknown error");
      sandbox.stub(articles.db, "execute").returns(Promise.reject(error));

      return articles
        .importChanges(result, [{ title: "bar" }])
        .then(res => res.errors)
        .should.eventually.become([
          {
            type: "incoming",
            message: error.message,
            stack: error.stack,
          },
        ]);
    });

    it("should only retrieve the changed record", () => {
      const id1 = uuid4();
      const id2 = uuid4();
      const execute = sandbox
        .stub(articles.db, "execute")
        .returns(Promise.resolve([]));

      return articles
        .importChanges(result, [
          { id: id1, title: "foo" },
          { id: id2, title: "bar" },
        ])
        .then(() => {
          const preload = execute.lastCall.args[1].preload;
          expect(preload).eql([id1, id2]);
        });
    });

    it("should merge remote with local fields", () => {
      const id1 = uuid4();
      return articles
        .create({ id: id1, title: "bar", size: 12 }, { synced: true })
        .then(() => articles.importChanges(result, [{ id: id1, title: "foo" }]))
        .then(res => {
          expect(res.updated[0].new.title).eql("foo");
          expect(res.updated[0].new.size).eql(12);
        });
    });

    it("should ignore local fields when detecting conflicts", () => {
      const id1 = uuid4();
      articles = testCollection({ localFields: ["size"] });
      // Create record with status not synced.
      return articles
        .create(
          { id: id1, title: "bar", size: 12, last_modified: 42 },
          { useRecordId: true }
        )
        .then(() =>
          articles.importChanges(result, [
            { id: id1, title: "bar", last_modified: 43 },
          ])
        )
        .then(res => {
          // No conflict, local.title == remote.title.
          expect(res.ok).eql(true);
          expect(res.updated[0].new.title).eql("bar");
          // Local field is preserved
          expect(res.updated[0].new.size).eql(12);
          // Timestamp was taken from remote
          expect(res.updated[0].new.last_modified).eql(43);
        });
    });

    it("should overwrite local records with PULL_ONLY", () => {
      const id1 = uuid4();
      const id2 = uuid4();
      const id3 = uuid4();
      return articles
        .create({ id: id1, title: "bar" }, { synced: true })
        .then(() => articles.update({ id: id1, title: "foo" }))
        .then(() =>
          articles.create({ id: id3, title: "bam" }, { synced: true })
        )
        .then(() =>
          articles.importChanges(
            result,
            [
              { id: id1, title: "baz", last_modified: 123 },
              { id: id2, title: "pow", last_modified: 124 },
              { id: id3, deleted: true, last_modified: 125 },
            ],
            Collection.strategy.PULL_ONLY
          )
        )
        .then(res => {
          expect(res.ok).eql(true);
          expect(res.resolved.length).eql(0);
          expect(res.published.length).eql(0);
          expect(res.created.length).eql(1);
          expect(res.updated.length).eql(1);
          expect(res.deleted.length).eql(1);
          expect(res.created[0].title).eql("pow");
          expect(res.updated[0].old.title).eql("foo");
          expect(res.updated[0].new.title).eql("baz");
          expect(res.deleted[0].id).eql(id3);
        });
    });
  });

  /** @test {Collection#pushChanges} */
  describe("#pushChanges", () => {
    let client, articles, result;
    const records = [{ id: uuid4(), title: "foo", _status: "created" }];

    beforeEach(() => {
      client = new KintoClient("http://server.com/v1")
        .bucket("bucket")
        .collection("collection");
      articles = testCollection();
      result = new SyncResultObject();
    });

    it("should publish local changes to the server", () => {
      const batchRequests = sandbox
        .stub(KintoClient.prototype, "_batchRequests")
        .returns(Promise.resolve([{}]));

      return articles.pushChanges(client, records, result).then(_ => {
        const requests = batchRequests.firstCall.args[0];
        const options = batchRequests.firstCall.args[1];
        expect(requests).to.have.length.of(1);
        expect(requests[0].body.data.title).eql("foo");
        expect(options.safe).eql(true);
      });
    });

    it("should not publish local fields to the server", () => {
      const batchRequests = sandbox
        .stub(KintoClient.prototype, "_batchRequests")
        .returns(Promise.resolve([{}]));

      articles = testCollection({ localFields: ["size"] });
      const toSync = [{ ...records[0], title: "ah", size: 3.14 }];
      return articles.pushChanges(client, toSync, result).then(_ => {
        const requests = batchRequests.firstCall.args[0];
        expect(requests[0].body.data.title).eql("ah");
        expect(requests[0].body.data.size).to.not.exist;
      });
    });

    it("should update published records local status", () => {
      sandbox.stub(KintoClientCollection.prototype, "batch").returns(
        Promise.resolve({
          published: [{ data: records[0] }],
          errors: [],
          conflicts: [],
          skipped: [],
        })
      );
      return articles
        .pushChanges(client, records, result)
        .then(res => res.published)
        .should.eventually.become([
          {
            _status: "synced",
            id: records[0].id,
            title: "foo",
          },
        ]);
    });

    it("should not publish records created and deleted locally and never synced", () => {
      const batchRequests = sandbox
        .stub(KintoClient.prototype, "_batchRequests")
        .returns(Promise.resolve([]));

      const toDelete = [{ id: records[0].id, _status: "deleted" }]; // no timestamp.
      return articles.pushChanges(client, toDelete, result).then(_ => {
        const requests = batchRequests.firstCall.args[0];
        expect(requests).eql([]);
      });
    });

    it("should delete unsynced virtually deleted local records", () => {
      const locallyDeletedId = records[0].id;
      sandbox.stub(KintoClientCollection.prototype, "batch").returns(
        Promise.resolve({
          published: [{ data: { id: locallyDeletedId, deleted: true } }],
          errors: [],
          conflicts: [],
          skipped: [],
        })
      );
      return articles
        .delete(locallyDeletedId)
        .then(_ => articles.pushChanges(client, records, result))
        .then(_ => articles.get(locallyDeletedId, { includeDeleted: true }))
        .should.be.eventually.rejectedWith(Error, /not found/);
    });

    it("should delete locally the records deleted remotely", () => {
      sandbox.stub(KintoClientCollection.prototype, "batch").returns(
        Promise.resolve({
          published: [{ data: { id: records[0].id, deleted: true } }],
          errors: [],
          conflicts: [],
          skipped: [],
        })
      );
      return articles
        .pushChanges(client, [], result)
        .then(res => res.published)
        .should.eventually.become([{ id: records[0].id, deleted: true }]);
    });

    it("should delete locally the records already deleted remotely", () => {
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
      return articles
        .create({ id, title: "bar" }, { useRecordId: true, synced: true })
        .then(() => articles.pushChanges(client, records, result))
        .then(_ => articles.get(id, { includeDeleted: true }))
        .should.be.eventually.rejectedWith(Error, /not found/);
    });

    describe("Batch requests made", () => {
      let batch, batchSpy, deleteRecord, createRecord, updateRecord;
      beforeEach(() => {
        batch = {
          deleteRecord: function() {},
          createRecord: function() {},
          updateRecord: function() {},
        };
        batchSpy = sandbox.mock(batch);
        deleteRecord = batchSpy.expects("deleteRecord");
        createRecord = batchSpy.expects("createRecord");
        updateRecord = batchSpy.expects("updateRecord");
        sandbox.stub(KintoClientCollection.prototype, "batch").callsFake(f => {
          f(batch);
          return Promise.resolve({
            published: [],
            errors: [],
            conflicts: [],
            skipped: [],
          });
        });
      });

      it("should call delete() for deleted records", () => {
        const myDeletedRecord = {
          id: "deleted-record-id",
          _status: "deleted",
          last_modified: 1234,
        };
        deleteRecord.once();
        createRecord.never();
        updateRecord.never();
        return articles
          .pushChanges(client, [myDeletedRecord], result)
          .then(() => batchSpy.verify())
          .then(() => deleteRecord.firstCall.args)
          .should.eventually.eql([myDeletedRecord]);
      });

      it("should call create() for created records", () => {
        const myCreatedRecord = { id: "created-record-id", _status: "created" };
        deleteRecord.never();
        createRecord.once();
        updateRecord.never();
        return articles
          .pushChanges(client, [myCreatedRecord], result)
          .then(() => batchSpy.verify())
          .then(() => createRecord.firstCall.args)
          .should.eventually.eql([{ id: "created-record-id" }]);
      });

      it("should call update() for updated records", () => {
        const myUpdatedRecord = {
          id: "updated-record-id",
          _status: "updated",
          last_modified: 1234,
        };
        deleteRecord.never();
        createRecord.never();
        updateRecord.once();
        return articles
          .pushChanges(client, [myUpdatedRecord], result)
          .then(() => batchSpy.verify())
          .then(() => updateRecord.firstCall.args)
          .should.eventually.eql([
            { id: "updated-record-id", last_modified: 1234 },
          ]);
      });
    });

    describe("Error handling", () => {
      const error = {
        path: "/buckets/default/collections/test/records/123",
        sent: { data: { id: "123" } },
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

      it("should report encountered publication errors", () => {
        return articles
          .pushChanges(client, records, result)
          .then(res => res.errors)
          .should.eventually.become([{ ...error, type: "outgoing" }]);
      });

      it("should report typed publication errors", () => {
        return articles
          .pushChanges(client, records, result)
          .then(res => res.errors[0])
          .should.eventually.have.property("type")
          .eql("outgoing");
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
    let articles;

    beforeEach(() => {
      articles = testCollection();
      return Promise.all(
        fixtures.map(fixture => {
          return articles.create(fixture, { synced: true });
        })
      ).then(_ => {
        return articles.delete(fixtures[1].id);
      });
    });

    it("should reset the synced status of all local records", () => {
      return articles
        .resetSyncStatus()
        .then(_ => articles.list({ filters: { _status: "synced" } }))
        .should.eventually.have.property("data")
        .to.have.length(0);
    });

    it("should garbage collect the locally deleted records", () => {
      return articles
        .resetSyncStatus()
        .then(_ => {
          return articles.list(
            { filters: { _status: "deleted" } },
            { includeDeleted: true }
          );
        })
        .should.eventually.have.property("data")
        .to.have.length(0);
    });

    it("should clear last modified value of all records", () => {
      return articles
        .resetSyncStatus()
        .then(_ => articles.list())
        .then(res => res.data.some(r => r.last_modified))
        .should.eventually.eql(false);
    });

    it("should clear any previously saved lastModified value", () => {
      return articles
        .resetSyncStatus()
        .then(_ => articles.db.getLastModified())
        .should.become(null);
    });

    it("should resolve with the number of local records processed ", () => {
      return articles.resetSyncStatus().should.become(3);
    });
  });

  /** @test {Collection#sync} */
  describe("#sync", () => {
    const fixtures = [{ title: "art1" }, { title: "art2" }, { title: "art3" }];
    let articles, ids;

    beforeEach(() => {
      articles = testCollection();
      sandbox.stub(api, "batch").get(() => () => ({
        errors: [],
        published: [],
        conflicts: [],
        skipped: [],
      }));
      return Promise.all(
        fixtures.map(fixture => articles.create(fixture))
      ).then(res => (ids = res.map(r => r.data.id)));
    });

    it("should validate the remote option", () => {
      return articles
        .sync({ remote: "http://fake.invalid" })
        .should.be.rejectedWith(Error, /contain the version/);
    });

    it("should use a custom remote option", () => {
      sandbox.stub(articles, "importChanges");
      sandbox.stub(articles, "pushChanges").returns(new SyncResultObject());
      const fetch = sandbox
        .stub(global, "fetch")
        .returns(fakeServerResponse(200, { data: [] }, {}));

      return articles.sync({ remote: "http://test/v1" }).then(res => {
        sinon.assert.calledWith(fetch, sinon.match(/http:\/\/test\/v1/));
      });
    });

    it("should revert the custom remote option on success", () => {
      sandbox.stub(articles, "importChanges");
      sandbox.stub(articles, "pushChanges").returns(new SyncResultObject());
      sandbox
        .stub(global, "fetch")
        .returns(fakeServerResponse(200, { data: [] }, {}));

      return articles.sync({ remote: "http://test/v1" }).then(_ => {
        expect(api.remote).eql(FAKE_SERVER_URL);
      });
    });

    it("should revert the custom remote option on failure", () => {
      sandbox.stub(articles, "importChanges");
      sandbox.stub(articles, "pushChanges").returns(Promise.reject("boom"));
      sandbox
        .stub(global, "fetch")
        .returns(fakeServerResponse(200, { data: [] }, {}));

      return articles.sync({ remote: "http://test/v1" }).catch(_ => {
        expect(api.remote).eql(FAKE_SERVER_URL);
      });
    });

    it("should load fixtures", () => {
      return articles
        .list()
        .then(res => res.data)
        .should.eventually.have.length.of(3);
    });

    it("should pullMetadata with options", () => {
      const pullMetadata = sandbox.stub(articles, "pullMetadata");
      sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
        Promise.resolve({
          last_modified: "42",
          next: () => {},
          data: [],
        })
      );
      const options = {
        headers: {
          Authorization: "Basic 123",
        },
      };
      return articles.sync(options).then(res => {
        expect(pullMetadata.callCount).equal(1);
        // First argument is the client, which we don't care too much about
        // Second argument is the options
        expect(pullMetadata.getCall(0).args[1]).include(options);
      });
    });

    it("should fetch latest changes from the server", () => {
      sandbox.stub(articles, "pullMetadata");
      const listRecords = sandbox
        .stub(KintoClientCollection.prototype, "listRecords")
        .returns(
          Promise.resolve({
            last_modified: "42",
            next: () => {},
            data: [],
          })
        );
      return articles.sync().then(res => {
        // Never synced so we fetch all the records from the server
        sinon.assert.calledWithMatch(listRecords, { since: undefined });
      });
    });

    it("should store latest lastModified value when no conflicts", () => {
      sandbox.stub(articles, "pullMetadata");
      sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
        Promise.resolve({
          last_modified: "42",
          next: () => {},
          data: [],
        })
      );
      return articles.sync().then(res => {
        expect(articles.lastModified).eql(42);
      });
    });

    it("shouldn't store latest lastModified on conflicts", () => {
      sandbox.stub(articles, "pullMetadata");
      sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
        Promise.resolve({
          last_modified: "43",
          next: () => {},
          data: [
            {
              id: ids[0],
              title: "art1mod",
              last_modified: 43,
            },
          ],
        })
      );
      return articles.sync().then(res => {
        expect(articles.lastModified).eql(null);
      });
    });

    it("shouldn't store latest lastModified on errors", () => {
      sandbox.stub(articles, "pullMetadata");
      sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
        Promise.resolve({
          last_modified: "43",
          next: () => {},
          data: [
            {
              id: ids[0],
              title: "art1mod",
            },
          ],
        })
      );
      sandbox
        .stub(articles.db, "execute")
        .returns(Promise.reject(new Error("error")));
      return articles.sync().then(res => {
        expect(articles.lastModified).eql(null);
      });
    });

    it("should not execute a last pull on push failure", () => {
      sandbox.stub(articles, "pullMetadata");
      const pullChanges = sandbox.stub(articles, "pullChanges");
      sandbox
        .stub(articles, "pushChanges")
        .callsFake((client, changes, result) => {
          result.add("conflicts", [1]);
        });
      return articles.sync().then(() => sinon.assert.calledOnce(pullChanges));
    });

    it("should not execute a last pull if nothing to push", () => {
      sandbox.stub(articles, "pullMetadata");
      sandbox.stub(articles, "gatherLocalChanges").returns(Promise.resolve([]));
      const pullChanges = sandbox
        .stub(articles, "pullChanges")
        .returns(Promise.resolve(new SyncResultObject()));
      return articles.sync().then(res => {
        sinon.assert.calledOnce(pullChanges);
      });
    });

    it("should not redownload pushed changes", () => {
      const record1 = { id: uuid4(), title: "blog" };
      const record2 = { id: uuid4(), title: "post" };
      sandbox.stub(articles, "pullMetadata");
      sandbox.stub(articles, "pullChanges");
      sandbox
        .stub(articles, "pushChanges")
        .callsFake((client, changes, result) => {
          result.add("published", record1);
          result.add("published", record2);
        });
      return articles.sync().then(res => {
        expect(res.published).to.have.length(2);
        expect(articles.pullChanges.lastCall.args[2].exclude).eql([
          record1,
          record2,
        ]);
      });
    });

    it("should store collection metadata", () => {
      sandbox.stub(articles, "pullChanges");
      const metadata = { id: "articles", last_modified: 42 };
      sandbox
        .stub(KintoClientCollection.prototype, "getData")
        .returns(Promise.resolve(metadata));
      return articles.sync().then(async () => {
        const stored = await articles.metadata();
        expect(stored, metadata);
      });
    });

    describe("Options", () => {
      let pullChanges;

      beforeEach(() => {
        sandbox.stub(articles, "pullMetadata");
        pullChanges = sandbox
          .stub(articles, "pullChanges")
          .returns(Promise.resolve(new SyncResultObject()));
      });

      it("should transfer the headers option", () => {
        return articles.sync({ headers: { Foo: "Bar" } }).then(() => {
          expect(pullChanges.firstCall.args[2])
            .to.have.property("headers")
            .eql({ Foo: "Bar" });
        });
      });

      it("should transfer the strategy option", () => {
        return articles
          .sync({ strategy: Collection.strategy.SERVER_WINS })
          .then(() => {
            expect(pullChanges.firstCall.args[2])
              .to.have.property("strategy")
              .eql(Collection.strategy.SERVER_WINS);
          });
      });

      it("should transfer the retry option", () => {
        return articles.sync({ retry: 3 }).then(() => {
          expect(pullChanges.firstCall.args[2])
            .to.have.property("retry")
            .eql(3);
        });
      });

      it("should transfer the expectedTimestamp option", () => {
        return articles.sync({ expectedTimestamp: '"123"' }).then(() => {
          expect(pullChanges.firstCall.args[2])
            .to.have.property("expectedTimestamp")
            .eql('"123"');
        });
      });
    });

    describe("Server backoff", () => {
      it("should reject on server backoff by default", () => {
        articles.kinto = { api: { backoff: 30000 } };
        return articles
          .sync()
          .should.be.rejectedWith(Error, /back off; retry in 30s/);
      });

      it("should perform sync on server backoff when ignoreBackoff is true", () => {
        sandbox
          .stub(articles.db, "getLastModified")
          .returns(Promise.resolve({}));
        sandbox.stub(articles, "pullMetadata");
        const pullChanges = sandbox.stub(articles, "pullChanges");
        sandbox.stub(articles, "pushChanges");
        articles.api.events.emit("backoff", new Date().getTime() + 30000);

        return articles
          .sync({ ignoreBackoff: true })
          .then(_ => sinon.assert.calledOnce(pullChanges));
      });
    });

    describe("Retry", () => {
      let fetch;

      beforeEach(() => {
        // Disable stubbing of kinto-http of upper tests.
        sandbox.restore();
        // Stub low-level fetch instead.
        fetch = sandbox.stub(global, "fetch");
        // Pull metadata
        fetch.onCall(0).returns(fakeServerResponse(200, { data: {} }, {}));
        // Pull records
        fetch.onCall(1).returns(fakeServerResponse(200, { data: [] }, {}));
        // Push
        fetch.onCall(2).returns(fakeServerResponse(200, { settings: {} }, {}));
        fetch
          .onCall(3)
          .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));
        fetch.onCall(4).returns(
          fakeServerResponse(
            200,
            {
              responses: [
                { status: 201, body: { data: { id: 1, last_modified: 41 } } },
                { status: 201, body: { data: { id: 2, last_modified: 42 } } },
                { status: 201, body: { data: { id: 3, last_modified: 43 } } },
              ],
            },
            { ETag: '"123"' }
          )
        );
        // Last pull
        fetch.onCall(5).returns(fakeServerResponse(200, { data: [] }, {}));
        // Avoid actually waiting real time between retries in test suites.
        sandbox.stub(global, "setTimeout").callsFake(fn => setImmediate(fn));
      });

      it("should retry if specified", () => {
        return articles.sync({ retry: 3 }).then(result => {
          //console.log(fetch.getCalls());
          expect(result.ok).eql(true);
        });
      });
    });

    describe("Events", () => {
      let onsuccess;
      let onerror;

      beforeEach(() => {
        onsuccess = sinon.spy();
        onerror = sinon.spy();
        articles.events.on("sync:success", onsuccess);
        articles.events.on("sync:error", onerror);

        sandbox
          .stub(articles.db, "getLastModified")
          .returns(Promise.resolve({}));
        sandbox.stub(articles, "pullMetadata");
        sandbox.stub(articles, "pullChanges");
        sandbox.stub(articles, "pushChanges");
      });

      it("should send a success event", () => {
        return articles.sync().then(() => {
          expect(onsuccess.called).eql(true);
          expect(onerror.called).eql(false);
        });
      });

      it("should send an error event", () => {
        articles.pushChanges.throws(new Error("boom"));
        return articles.sync().catch(() => {
          expect(onsuccess.called).eql(false);
          expect(onerror.called).eql(true);
        });
      });

      it("should send an error event", () => {
        articles.pushChanges.throws(new Error("boom"));
        return articles.sync().catch(() => {
          expect(onsuccess.called).eql(false);
          expect(onerror.called).eql(true);
        });
      });

      it("should provide success details about sync", () => {
        return articles.sync().then(() => {
          const data = onsuccess.firstCall.args[0];
          expect(data).to.have.property("result");
          expect(data).to.have.property("remote");
          expect(data).to.have.property("bucket");
          expect(data).to.have.property("collection");
          expect(data).to.have.property("headers");
        });
      });

      it("should provide error details about sync", () => {
        articles.pushChanges.throws(new Error("boom"));
        return articles.sync().catch(() => {
          const data = onerror.firstCall.args[0];
          expect(data).to.have.property("error");
          expect(data).to.have.property("remote");
          expect(data).to.have.property("bucket");
          expect(data).to.have.property("collection");
          expect(data).to.have.property("headers");
        });
      });
    });
  });

  /** @test {Collection#execute} */
  describe("#execute", () => {
    let articles;
    beforeEach(() => {
      articles = testCollection();
    });

    it("should support get", () => {
      return articles
        .create(article)
        .then(result => {
          const id = result.data.id;
          return articles.execute(txn => txn.get(id), { preloadIds: [id] });
        })
        .then(result => expect(result.data.title).eql("foo"));
    });

    it("should support getAny", () => {
      return articles
        .create(article)
        .then(result => {
          const id = result.data.id;
          return articles.execute(txn => txn.getAny(id), { preloadIds: [id] });
        })
        .then(result => expect(result.data.title).eql("foo"));
    });

    it("should support delete", () => {
      let id;
      return articles
        .create(article)
        .then(result => {
          id = result.data.id;
          return articles.execute(txn => txn.delete(id), { preloadIds: [id] });
        })
        .then(result => articles.getAny(id))
        .then(result => expect(result.data._status).eql("deleted"));
    });

    it("should support deleteAll", () => {
      let id;
      return articles
        .create(article)
        .then(result => {
          id = result.data.id;
          return articles.execute(txn => txn.deleteAll([id]), {
            preloadIds: [id],
          });
        })
        .then(result => articles.getAny(id))
        .then(result => expect(result.data._status).eql("deleted"));
    });

    it("should support deleteAny", () => {
      let id;
      return articles
        .create(article)
        .then(result => {
          id = result.data.id;
          return articles.execute(txn => txn.deleteAny(id), {
            preloadIds: [id],
          });
        })
        .then(result => articles.getAny(id))
        .then(result => expect(result.data._status).eql("deleted"));
    });

    it("should support create", () => {
      const id = uuid4();
      return articles
        .execute(txn => txn.create({ id, ...article }), { preloadIds: [id] })
        .then(result => expect(result.data.title).eql("foo"));
    });

    it("should support update", () => {
      let id;
      return articles
        .create(article)
        .then(result => {
          id = result.data.id;
          return articles.execute(
            txn => txn.update({ id, title: "new title" }),
            { preloadIds: [id] }
          );
        })
        .then(result => articles.get(id))
        .then(result => expect(result.data.title).eql("new title"));
    });

    it("should support upsert", () => {
      const id = uuid4();
      return articles
        .upsert({ id, ...article })
        .then(result => result.data.id)
        .then(result => articles.get(id))
        .then(result => expect(result.data.title).eql("foo"));
    });

    it("should roll back operations if there's a failure", () => {
      let id;
      return articles
        .create(article)
        .then(result => {
          id = result.data.id;
          return articles.execute(
            txn => {
              txn.deleteAny(id);
              txn.delete(uuid4()); // this should fail
            },
            { preloadIds: [id] }
          );
        })
        .catch(() => null)
        .then(result => articles.getAny(id))
        .then(result => expect(result.data._status).eql("created"));
    });

    it("should perform all operations if there's no failure", () => {
      let id1, id2;
      return articles
        .create(article)
        .then(result => {
          id1 = result.data.id;
          return articles.create({ title: "foo2", url: "http://foo2" });
        })
        .then(result => {
          id2 = result.data.id;
          return articles.execute(
            txn => {
              txn.deleteAny(id1);
              txn.deleteAny(id2);
            },
            { preloadIds: [id1, id2] }
          );
        })
        .then(result => articles.getAny(id1))
        .then(result => expect(result.data._status).eql("deleted"))
        .then(result => articles.getAny(id2))
        .then(result => expect(result.data._status).eql("deleted"));
    });

    it("should resolve to the return value of the transaction", () => {
      return articles
        .create(article)
        .then(() => {
          return articles.execute(txn => {
            return "hello";
          });
        })
        .then(result => expect(result).eql("hello"));
    });

    it("has operations that are synchronous", () => {
      let createdArticle;
      return articles
        .create(article)
        .then(result => {
          return articles.execute(
            txn => {
              createdArticle = txn.get(result.data.id).data;
            },
            { preloadIds: [result.data.id] }
          );
        })
        .then(result => expect(createdArticle.title).eql("foo"));
    });
  });

  /** @test {Collection#pullMetadata} */
  describe("#pullMetadata", () => {
    let articles;

    beforeEach(() => (articles = testCollection()));

    it("passes headers to underlying client", () => {
      const headers = {
        Authorization: "Basic 123",
      };

      const client = {
        getData: sandbox.stub(),
      };
      return articles.pullMetadata(client, { headers }).then(_ => {
        sinon.assert.calledWithExactly(client.getData, {
          headers,
        });
      });
    });
  });

  describe("Events", () => {
    let articles, article;

    beforeEach(() => {
      articles = testCollection();
      return articles
        .create({ title: "foo" })
        .then(({ data }) => (article = data));
    });

    it("should emit an event on create", done => {
      articles.events.on("create", () => done());
      articles.create({ title: "win" });
    });

    it("should emit an event on update", done => {
      articles.events.on("update", () => done());
      articles.update({ ...article, title: "changed" });
    });

    it("should emit an event on delete", done => {
      articles.events.on("delete", () => done());
      articles.delete(article.id);
    });

    it("should emit a 'delete' event when calling deleteAll", done => {
      articles.events.on("delete", () => done());
      articles.deleteAll();
    });

    it("should emit a 'deleteAll' event when calling deleteAll", done => {
      articles.events.on("deleteAll", () => done());
      articles.deleteAll();
    });

    it("should emit an event on deleteAny", done => {
      articles.events.on("delete", () => done());
      articles.deleteAny(article.id);
    });

    it("should not emit if deleteAny fails", done => {
      articles.events.on("delete", () => done(new Error("fail")));
      articles.deleteAny(uuid4()).then(() => done());
    });

    it("should emit a create event on upsert", done => {
      articles.events.on("create", () => done());
      articles.upsert({ id: uuid4(), create: "new" });
    });

    it("should emit a update event on upsert", done => {
      articles.events.on("update", () => done());
      articles.upsert({ update: "existing", ...article });
    });

    it("should provide created record in data", done => {
      articles.events.on("create", event => {
        expect(event)
          .to.have.property("data")
          .to.have.property("title")
          .eql("win");
        done();
      });
      articles.create({ title: "win" });
    });

    it("should provide new record in data and old record", done => {
      articles.events.on("update", event => {
        const { data, oldRecord } = event;
        expect(data)
          .to.have.property("title")
          .eql("changed");
        expect(oldRecord)
          .to.have.property("title")
          .eql("foo");
        done();
      });
      articles.update({ ...article, title: "changed" });
    });

    it("should not provide oldRecord on creation with upsert", done => {
      articles.events.on("create", event => {
        expect(event).not.to.have.property("oldRecord");
        done();
      });
      articles.upsert({ id: uuid4(), some: "new" });
    });

    it("should provide old record", done => {
      articles.events.on("delete", event => {
        expect(event)
          .to.have.property("data")
          .to.have.property("title")
          .eql("foo");
        done();
      });
      articles.delete(article.id);
    });

    describe("Transactions", () => {
      it("should send every events of a transaction", () => {
        const callback = sinon.spy();
        articles.events.on("create", callback);

        return articles
          .execute(txn => {
            txn.create({ id: uuid4(), title: "foo" });
            txn.create({ id: uuid4(), title: "bar" });
          })
          .then(() => expect(callback.callCount, 2));
      });

      it("should not send any event if the transaction fails", () => {
        const callback = sinon.spy();
        articles.events.on("create", callback);

        return articles
          .execute(txn => {
            txn.create({ id: uuid4(), title: "foo" });
            throw new Error("Fail!");
          })
          .catch(() => {})
          .then(() => expect(callback.callCount).eql(0));
      });

      it("should not send any change event if nothing happens in transaction", () => {
        const callback = sinon.spy();
        articles.events.on("change", callback);

        return articles
          .execute(txn => {
            txn.deleteAny({ id: uuid4() });
          })
          .then(() => expect(callback.callCount).eql(0));
      });

      it("should send a single changed event for the whole transaction", () => {
        const callback = sinon.spy();
        const id = uuid4();
        const id2 = uuid4();

        return articles
          .create({ id, title: "foo" }, { useRecordId: true })
          .then(() => {
            articles.events.on("change", callback);
            return articles.execute(
              txn => {
                txn.create({ id: id2, title: "bar" });
                txn.update({ id, size: 42 });
                txn.delete(id);
              },
              { preloadIds: [id] }
            );
          })
          .then(() => {
            expect(callback.callCount).eql(1);
            const payload = callback.lastCall.args[0];
            const { targets } = payload;
            expect(targets.length).eql(3);
            expect(targets[0]).eql({
              action: "create",
              data: { id: id2, title: "bar" },
            });
            expect(targets[1]).eql({
              action: "update",
              data: { _status: "created", id, size: 42 }, // never synced.
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
});
