"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import { EventEmitter } from "events";
import { v4 as uuid4 } from "uuid";

import IDB from "../src/adapters/IDB";
import BaseAdapter from "../src/adapters/base";
import Collection, { SyncResultObject } from "../src/collection";
import Api from "kinto-client";
import KintoClient from "kinto-client";
import KintoClientCollection from "kinto-client/lib/collection.js";
import { cleanRecord } from "../src/collection";
import { updateTitleWithDelay, fakeServerResponse } from "./test_utils";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_BUCKET_NAME = "kinto-test";
const TEST_COLLECTION_NAME = "kinto-test";
const FAKE_SERVER_URL = "http://fake-server/v1";

/** @test {Collection} */
describe("Collection", () => {
  /*eslint-disable */
  let sandbox, events, idSchema, remoteTransformers, hooks, api;
  /*eslint-enable */
  const article = {title: "foo", url: "http://foo"};

  function testCollection(options={}) {
    events = new EventEmitter();
    idSchema = options.idSchema;
    remoteTransformers = options.remoteTransformers;
    hooks = options.hooks;
    api = new Api(FAKE_SERVER_URL, events);
    return new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api, {
      events,
      idSchema,
      remoteTransformers,
      hooks,
      adapter: IDB
    });
  }

  function createEncodeTransformer(char, delay) {
    return {
      encode(record) {
        return updateTitleWithDelay(record, char, delay);
      },
      decode(record) {}
    };
  }

  function createIntegerIdSchema() {
    let _next = 0;
    return {
      generate() {
        return _next++;
      },
      validate(id) {
        return ((id == parseInt(id, 10)) && (id >= 0));
      }
    };
  }

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    return testCollection().clear();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("Helpers", () => {
    /** @test {cleanRecord} */
    describe("#cleanRecord", () => {
      it("should clean record data", () => {
        expect(cleanRecord({title: "foo", _status: "foo"}))
          .eql({title: "foo"});
      });
    });
  });

  /** @test {Collection#constructor} */
  describe("#constructor", () => {
    it("should expose a passed events instance", () => {
      const events = new EventEmitter();
      const api = new Api(FAKE_SERVER_URL, {events});
      const collection = new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api, {events, adapter: IDB});
      expect(collection.events).to.eql(events);
    });

    it("should propagate its events property to child dependencies", () => {
      const events = new EventEmitter();
      const api = new Api(FAKE_SERVER_URL, {events});
      const collection = new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api, {events, adapter: IDB});
      expect(collection.api.events).eql(collection.events);
      expect(collection.api.http.events).eql(collection.events);
    });

    it("should allow providing a prefix for the db name", () => {
      const collection = new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api, {
        dbPrefix: "user-x/",
        adapter: IDB,
      });
      expect(collection.db.dbname).eql("user-x/kinto-test/kinto-test");
    });

    it("should complain if a database adapter is not provided", () => {
      const events = new EventEmitter();
      const api = new Api(FAKE_SERVER_URL, {events});
      expect(() => {
        new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api);
      }).to.Throw(Error,/No adapter provided/);
    });

    it("should throw incompatible adapter options", () => {
      const events = new EventEmitter();
      const api = new Api(FAKE_SERVER_URL, {events});
      expect(() => {
        new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api, {adapter: function(){}});
      }).to.Throw(Error, /Unsupported adapter/);
    });

    it("should allow providing an adapter option", () => {
      const MyAdapter = class extends BaseAdapter {};
      const collection = new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api, {
        adapter: MyAdapter
      });
      expect(collection.db).to.be.an.instanceOf(MyAdapter);
    });

    it("should select the KintoClient configured bucket and collection", () => {
      const collection = new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api, {
        adapter: BaseAdapter
      });

      expect(collection._apiCollection)
        .to.have.property("options")
        .to.have.property("bucket")
        .eql(TEST_BUCKET_NAME);

      expect(collection._apiCollection)
        .to.have.property("name")
        .eql(TEST_COLLECTION_NAME);
    });

    describe("transformers registration", () => {
      function registerTransformers(transformers) {
        new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api, {
          remoteTransformers: transformers,
          adapter: IDB
        });
      }

      it("should throw an error on non-array remoteTransformers", () => {
        expect(registerTransformers.bind(null, {}))
          .to.Throw(Error, /remoteTransformers should be an array/);
      });

      it("should throw an error on non-object transformer", () => {
        expect(registerTransformers.bind(null, ["invalid"]))
          .to.Throw(Error, /transformer must be an object/);
      });

      it("should throw an error on encode method missing", () => {
        expect(registerTransformers.bind(null, [{decode(){}}]))
          .to.Throw(Error, /transformer must provide an encode function/);
      });

      it("should throw an error on decode method missing", () => {
        expect(registerTransformers.bind(null, [{encode(){}}]))
          .to.Throw(Error, /transformer must provide a decode function/);
      });
    });

    describe("hooks registration", () => {
      function registerHooks(hooks) {
        return new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api, {
          hooks,
          adapter: IDB
        });
      }

      it("should throw an error on non-object hooks", () => {
        expect(registerHooks.bind(null, function() {}))
          .to.Throw(Error, /hooks should be an object/);
      });

      it("should throw an error on array hooks", () => {
        expect(registerHooks.bind(null, []))
          .to.Throw(Error, /hooks should be an object, not an array./);
      });

      it("should return a empty object if no hook where specified", () => {
        const collection = registerHooks();
        expect(collection.hooks).to.eql({});
      });

      it("should throw an error on unknown hook", () => {
        expect(registerHooks.bind(null, {"invalid": []}))
          .to.Throw(Error, /The hook should be one of/);
      });

      it("should throw if the hook isn't a list", () => {
        expect(registerHooks.bind(null, {"incoming-changes": {}}))
          .to.Throw(Error, /A hook definition should be an array of functions./);
      });

      it("should throw an error if the hook is not an array of functions", () => {
        expect(registerHooks.bind(null, {"incoming-changes": ["invalid"]}))
          .to.Throw(Error, /A hook definition should be an array of functions./);
      });
    });

    describe("idSchema registration", () => {
      function registerIdSchema(idSchema) {
        new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api, {
          idSchema: idSchema,
          adapter: IDB
        });
      }

      it("should throw an error on non-object transformer", () => {
        expect(registerIdSchema.bind(null, "invalid"))
          .to.Throw(Error, /idSchema must be an object/);
      });

      it("should throw an error on generate method missing", () => {
        expect(registerIdSchema.bind(null, {validate(){}}))
          .to.Throw(Error, /idSchema must provide a generate function/);
      });

      it("should throw an error on validate method missing", () => {
        expect(registerIdSchema.bind(null, {generate(){}}))
          .to.Throw(Error, /idSchema must provide a validate function/);
      });
    });
  });

  /** @test {SyncResultObject} */
  describe("SyncResultObject", () => {
    it("should create a result object", () => {
      expect(new SyncResultObject()).to.include.keys([
        "lastModified",
        "errors",
        "created",
        "updated",
        "deleted",
        "published",
        "conflicts",
        "skipped",
      ]);
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
        articles.create({title: "foo"}),
        articles.create({title: "bar"}),
      ]);
    });

    it("should clear collection records", () => {
      return articles.clear()
        .then(_ => articles.list())
        .then(res => res.data)
        .should.eventually.have.length.of(0);
    });

    it("should clear collection metas", () => {
      return articles.db.saveLastModified(42)
        .then(_ => articles.clear())
        .then(_ => articles.db.getLastModified())
        .should.eventually.eql(null);
    });
  });

  /** @test {Collection#create} */
  describe("#create", () => {
    let articles;

    beforeEach(() => articles = testCollection());

    it("should create a record and return created record data", () => {
      return articles.create(article)
        .should.eventually.have.property("data");
    });

    it("should create a record and return created record perms", () => {
      return articles.create(article)
        .should.eventually.have.property("permissions");
    });

    it("should assign an id to the created record", () => {
      return articles.create(article)
        .then(result => result.data.id)
        .should.eventually.be.a("string");
    });

    it("should assign an id to the created record (custom IdSchema)", () => {
      articles = testCollection({
        idSchema: createIntegerIdSchema()
      });

      return articles.create(article)
        .then(result => result.data.id)
        .should.eventually.be.a("number");
    });

    it("should reject when useRecordId is true and record is missing an id", () => {
      return articles.create({title: "foo"}, {useRecordId: true})
        .should.be.rejectedWith(Error, /Missing required Id/);
    });

    it("should reject when synced is true and record is missing an id", () => {
      return articles.create({title: "foo"}, {synced: true})
        .should.be.rejectedWith(Error, /Missing required Id/);
    });

    it("should reject when passed an id and synced and useRecordId are false", () => {
      return articles.create({id: uuid4()}, {synced: false, useRecordId: false})
        .should.be.rejectedWith(Error, /Extraneous Id/);
    });

    it("should not alter original record", () => {
      return articles.create(article)
        .should.eventually.not.eql(article);
    });

    it("should add record status on creation", () => {
      return articles.create(article)
        .then(res => res.data._status)
        .should.eventually.eql("created");
    });

    it("should reject if passed argument is not an object", () => {
      return articles.create(42)
        .should.eventually.be.rejectedWith(Error, /is not an object/);
    });

    it("should actually persist the record into the collection", () => {
      return articles.create(article)
        .then(result => articles.get(result.data.id))
        .then(res => res.data.title)
        .should.become(article.title);
    });

    it("should support the useRecordId option", () => {
      const testId = uuid4();
      return articles.create({id: testId, title: "foo"}, {useRecordId: true})
        .then(result => articles.get(result.data.id))
        .then(res => res.data.id)
        .should.become(testId);
    });

    it("should validate record's Id when provided", () => {
      return articles.create({id: 42, title: "foo"}, {useRecordId: true})
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should validate record's Id when provided (custom IdSchema)", () => {
      articles = testCollection({
        idSchema: createIntegerIdSchema()
      });

      return articles.create({id: "deadbeef", title: "foo"}, {useRecordId: true})
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should reject with any encountered transaction error", () => {
      sandbox.stub(articles.db, "execute")
        .returns(Promise.reject(new Error("transaction error")));

      return articles.create({title: "foo"})
        .should.be.rejectedWith(Error, /transaction error/);
    });

    it("should reject with a hint if useRecordId has been used", () => {
      return articles.create({id: uuid4()}, {useRecordId: true})
        .then((res) => articles.delete(res.data.id))
        .then((res) => articles.create({id: res.data.id}, {useRecordId: true}))
        .should.be.rejectedWith(Error, /virtually deleted/);
    });
  });

  /** @test {Collection#update} */
  describe("#update", () => {
    let articles;

    beforeEach(() => articles = testCollection());

    it("should update a record", () => {
      return articles.create(article)
        .then(res => articles.get(res.data.id))
        .then(res => res.data)
        .then(existing => {
          return articles.update(
            Object.assign({}, existing, {title: "new title"}));
        })
        .then(res => articles.get(res.data.id))
        .then(res => res.data.title)
        .should.become("new title");
    });

    it("should update record status on update", () => {
      return articles.create(article)
        .then(res => res.data)
        .then(data => articles.update(Object.assign({}, data, {title: "blah"})))
        .then(res => res.data._status)
        .should.eventually.eql("updated");
    });

    it("should reject updates on a non-existent record", () => {
      return articles.update({id: uuid4()})
        .should.be.rejectedWith(Error, /not found/);
    });

    it("should reject updates on a non-object record", () => {
      return articles.update("invalid")
        .should.be.rejectedWith(Error, /Record is not an object/);
    });

    it("should reject updates on a record without an id", () => {
      return articles.update({title: "foo"})
        .should.be.rejectedWith(Error, /missing id/);
    });

    it("should validate record's id when provided", () => {
      return articles.update({id: 42})
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should validate record's id when provided (custom IdSchema)", () => {
      articles = testCollection({
        idSchema: createIntegerIdSchema()
      });

      return articles.update({id: "deadbeef"})
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should patch existing record when patch option is used", () => {
      const id = uuid4();
      return articles.create({id, title: "foo", last_modified: 42},
                             {useRecordId: true})
        .then(() => articles.update({id, rank: 99}, {patch: true}))
        .then((res) => res.data)
        .should.eventually.become({
          id,
          title: "foo",
          rank: 99,
          last_modified: 42,
          _status: "updated"
        });
    });

    it("should remove previous record fields", () => {
      return articles.create(article)
        .then(res => articles.get(res.data.id))
        .then(res => {
          return articles.update(
            Object.assign({}, {id: res.data.id}, {
              title: "new title",
            }));
        })
        .then(res => res.data)
          .should.eventually.not.have.property("url");
    });

    it("should preserve record.last_modified", () => {
      return articles.create({
        title: "foo",
        url: "http://foo",
        last_modified: 123456789012
      })
        .then(res => articles.get(res.data.id))
        .then(res => {
          return articles.update(
            Object.assign({}, {id: res.data.id}, {
              title: "new title",
            }));
        })
        .then(res => res.data)
          .should.eventually.have.property("last_modified").eql(123456789012);
    });

    it("should optionally mark a record as synced", () => {
      return articles.create({title: "foo"})
        .then(res => articles.update(Object.assign({}, res.data, {title: "bar"}),
                                     {synced: true}))
        .then(res => res.data)
        .should.eventually.have.property("_status").eql("synced");
    });
  });

  /** @test {Collection#resolve} */
  describe("#resolve", () => {
    let articles, local;

    beforeEach(() => {
      articles = testCollection();
      return articles.create({title: "local title", last_modified: 41})
        .then(res => local = res.data);
    });

    it("should mark a conflict as resolved", () => {
      const remote = Object.assign({}, local, {
        title: "blah",
        last_modified: 42,
      });
      const conflict = {
        type: "incoming",
        local: local,
        remote: remote,
      };
      const resolution = Object.assign({}, local, {title: "resolved"});
      return articles.resolve(conflict, resolution)
        .then(res => res.data)
        .should.eventually.become({
          _status: "updated",
          id: local.id,
          title: resolution.title,
          last_modified: remote.last_modified
        });
    });
  });

  /** @test {Collection#get} */
  describe("#get", () => {
    let articles, id;

    beforeEach(() => {
      articles = testCollection();
      return articles.create(article)
        .then(result => id = result.data.id);
    });

    it("should isolate records by bucket", () => {
      const otherbucket = new Collection("other", TEST_COLLECTION_NAME, api, {
        adapter: IDB});
      return otherbucket.get(id)
        .then(res => res.data)
        .should.be.rejectedWith(Error, /not found/);
    });

    it("should retrieve a record from its id", () => {
      return articles.get(id)
        .then(res => res.data.title)
        .should.eventually.eql(article.title);
    });

    it("should retrieve a record from its id (custom IdSchema)", () => {
      articles = testCollection({
        idSchema: createIntegerIdSchema()
      });

      return articles.create(article)
        .then(result => articles.get(result.data.id))
        .then(res => res.data.title)
        .should.eventually.eql(article.title);
    });

    it("should validate passed id", () => {
      return articles.get(42)
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should validate passed id (custom IdSchema)", () => {
      return articles.get("deadbeef")
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should have record status info attached", () => {
      return articles.get(id)
        .then(res => res.data._status)
        .should.eventually.eql("created");
    });

    it("should reject in case of record not found", () => {
      return articles.get(uuid4())
        .then(res => res.data)
        .should.be.rejectedWith(Error, /not found/);
    });

    it("should reject on virtually deleted record", () => {
      return articles.delete(id)
        .then(res => articles.get(id, {includeDeleted: true}))
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
      return articles.create(article)
        .then(result => id = result.data.id);
    });

    it("should validate passed id", () => {
      return articles.delete(42)
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    it("should validate passed id (custom IdSchema)", () => {
      return articles.delete("deadbeef")
        .should.be.rejectedWith(Error, /Invalid Id/);
    });

    describe("Virtual", () => {
      it("should virtually delete a record", () => {
        return articles.delete(id, {virtual: true})
          .then(res => articles.get(res.data.id, {includeDeleted: true}))
          .then(res => res.data._status)
          .should.eventually.eql("deleted");
      });

      it("should resolve with an already deleted record data", () => {
        return articles.delete(id, {virtual: true})
          .then(res => articles.delete(id, {virtual: true}))
          .then(res => res.data.id)
          .should.eventually.eql(id);
      });

      it("should reject on non-existent record", () => {
        return articles.delete(uuid4(), {virtual: true})
          .then(res => res.data)
          .should.eventually.be.rejectedWith(Error, /not found/);
      });
    });

    describe("Factual", () => {
      it("should factually delete a record", () => {
        return articles.delete(id, {virtual: false})
          .then(res => articles.get(res.data.id))
          .should.eventually.be.rejectedWith(Error, /not found/);
      });

      it("should resolve with deletion information", () => {
        return articles.delete(id, {virtual: false})
          .then(res => res.data)
          .should.eventually.eql({id: id});
      });

      it("should reject on non-existent record", () => {
        return articles.delete(uuid4(), {virtual: false})
          .then(res => res.data)
          .should.eventually.be.rejectedWith(Error, /not found/);
      });
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
          articles.create({title: "bar", url: "http://bar"})
        ]);
      });

      it("should retrieve the list of records", () => {
        return articles.list()
          .then(res => res.data)
          .should.eventually.have.length.of(2);
      });

      it("shouldn't list virtually deleted records", () => {
        return articles.create({title: "yay"})
          .then(res => articles.delete(res.data.id))
          .then(_ => articles.list())
          .then(res => res.data)
          .should.eventually.have.length.of(2);
      });

      it("should support the includeDeleted option", () => {
        return articles.create({title: "yay"})
          .then(res => articles.delete(res.data.id))
          .then(_ => articles.list({}, {includeDeleted: true}))
          .then(res => res.data)
          .should.eventually.have.length.of(3);
      });
    });

    describe("Ordering", () => {
      const fixtures = [
        {title: "art1", last_modified: 2, unread: false},
        {title: "art2", last_modified: 3, unread: true},
        {title: "art3", last_modified: 1, unread: false},
      ];

      beforeEach(() => {
        articles = testCollection();
        return Promise.all(fixtures.map(r => articles.create(r)));
      });

      it("should order records on last_modified DESC by default", () => {
        return articles.list()
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art2", "art1", "art3"]);
      });

      it("should order records on custom field ASC", () => {
        return articles.list({order: "title"})
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art1", "art2", "art3"]);
      });

      it("should order records on custom field DESC", () => {
        return articles.list({order: "-title"})
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art3", "art2", "art1"]);
      });

      it("should order records on boolean values ASC", () => {
        return articles.list({order: "unread"})
          .then(res => res.data.map(r => r.unread))
          .should.eventually.become([false, false, true]);
      });

      it("should order records on boolean values DESC", () => {
        return articles.list({order: "-unread"})
          .then(res => res.data.map(r => r.unread))
          .should.eventually.become([true, false, false]);
      });
    });

    describe("Filtering", () => {
      const fixtures = [
        {title: "art1", last_modified: 3, unread: true, complete: true},
        {title: "art2", last_modified: 2, unread: false, complete: true},
        {id: uuid4(), title: "art3", last_modified: 1, unread: true, complete: false},
      ];

      beforeEach(() => {
        articles = testCollection();
        return Promise.all([
          articles.create(fixtures[0]),
          articles.create(fixtures[1]),
          articles.create(fixtures[2], {synced: true})
        ]);
      });

      it("should filter records on indexed fields", () => {
        return articles.list({filters: {_status: "created"}})
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art1", "art2"]);
      });

      it("should filter records on existing field", () => {
        return articles.list({filters: {unread: true}})
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art1", "art3"]);
      });

      it("should filter records on missing field", () => {
        return articles.list({filters: {missing: true}})
          .then(res => res.data.map(r => r.title))
          .should.eventually.become([]);
      });

      it("should filter records on multiple fields using 'and'", () => {
        return articles.list({filters: {unread: true, complete: true}})
          .then(res => res.data.map(r => r.title))
          .should.eventually.become(["art1"]);
      });
    });

    describe("Ordering & Filtering", () => {
      const fixtures = [
        {title: "art1", last_modified: 3, unread: true, complete: true},
        {title: "art2", last_modified: 2, unread: false, complete: true},
        {title: "art3", last_modified: 1, unread: true, complete: true},
      ];

      beforeEach(() => {
        articles = testCollection();
        return Promise.all(fixtures.map(r => articles.create(r)));
      });

      it("should order and filter records", () => {
        return articles.list({
          order:   "-title",
          filters: {unread: true, complete: true}
        })
          .then(res => res.data.map(r => {
            return {title: r.title, unread: r.unread, complete: r.complete};
          }))
          .should.eventually.become([
            {title: "art3", unread: true, complete: true},
            {title: "art1", unread: true, complete: true},
          ]);
      });
    });
  });

  /** @test {Collection#loadDump} */
  describe("#loadDump", () => {
    let articles;

    beforeEach(() => articles = testCollection());

    it("should import records in the collection", () => {
      return articles.loadDump([
        {id: uuid4(), title: "foo", last_modified: 1452347896},
        {id: uuid4(), title: "bar", last_modified: 1452347985}
      ])
      .should.eventually.have.length(2);
    });

    it("should fail if records is not an array", () => {
      return articles.loadDump({id: 1, title: "foo"})
      .should.be.rejectedWith(Error, /^Error: Records is not an array./);
    });

    it("should fail if id is invalid", () => {
      return articles.loadDump([{id: 1, title: "foo"}])
      .should.be.rejectedWith(Error, /^Error: Record has invalid ID./);
    });

    it("should fail if id is missing", () => {
      return articles.loadDump([{title: "foo"}])
      .should.be.rejectedWith(Error, /^Error: Record has invalid ID./);
    });

    it("should fail if last_modified is missing", () => {
      return articles.loadDump([{id: uuid4(), title: "foo"}])
      .should.be.rejectedWith(Error, /^Error: Record has no last_modified value./);
    });

    it("should mark imported records as synced.", () => {
      const testId = uuid4();
      return articles.loadDump([
        {id: testId, title: "foo", last_modified: 1457896541}
      ])
      .then(() => {
        return articles.get(testId);
      })
      .then(res => res.data._status)
      .should.eventually.eql("synced");
    });

    it("should ignore already imported records.", () => {
      const record = {id: uuid4(), title: "foo", last_modified: 1457896541};
      return articles.loadDump([record])
      .then(() => articles.loadDump([record]))
      .should.eventually.have.length(0);
    });

    it("should overwrite old records.", () => {
      const record = {id: uuid4(), title: "foo", last_modified: 1457896541};
      return articles.loadDump([record])
        .then(() => {
          const updated = Object.assign({}, record, {last_modified: 1457896543});
          return articles.loadDump([updated]);
        })
        .should.eventually.have.length(1);
    });

    it("should not overwrite unsynced records.", () => {
      return articles.create({title: "foo"})
        .then(result => {
          const record = {id: result.data.id, title: "foo", last_modified: 1457896541};
          return articles.loadDump([record]);
        })
        .should.eventually.have.length(0);
    });

    it("should not overwrite records without last modified.", () => {
      return articles.create({id: uuid4(), title: "foo"}, {synced: true})
        .then(result => {
          const record = {id: result.data.id, title: "foo", last_modified: 1457896541};
          return articles.loadDump([record]);
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
        articles.create({title: "abcdef"}),
        articles.create({title: "ghijkl"}),
      ]);
    });

    describe("transformers", () => {
      it("should asynchronously encode records", () => {
        articles = testCollection({
          remoteTransformers: [
            createEncodeTransformer("?", 10),
            createEncodeTransformer("!", 5),
          ]
        });

        return articles.gatherLocalChanges()
          .then(res => res.toSync.map(r => r.title).sort())
          .should.become(["abcdef?!", "ghijkl?!"]);
      });
    });
  });

  /** @test {Collection#pullChanges} */
  describe("#pullChanges", () => {
    let listRecords, articles, result;

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
        {id: id_1, title: "art1"},
        {id: id_2, title: "art2"},
        {id: id_4, title: "art4"},
        {id: id_5, title: "art5"},
        {id: id_7, title: "art7-a"},
        {id: id_9, title: "art9"},  // will be deleted in beforeEach().
      ];
      const serverChanges = [
        {id: id_2, title: "art2"},   // existing & untouched, skipped
        {id: id_3, title: "art3"},   // to be created
        {id: id_4, deleted: true},   // to be deleted
        {id: id_6, deleted: true},   // remotely deleted & missing locally, skipped
        {id: id_7, title: "art7-b"}, // remotely conflicting
        {id: id_8, title: "art8"},   // to be created
        {id: id_9, deleted: true},   // remotely deleted & deleted locally, skipped
      ];

      beforeEach(() => {
        listRecords = sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
          Promise.resolve({
            data: serverChanges,
            next: () => {},
            last_modified: "\"42\"",
          }));
        return Promise.all(localData.map(fixture => {
          return articles.create(fixture, {synced: true});
        }))
        .then(_ => {
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
                }
              ]
            }
          });

          return articles.pullChanges(result)
            .then(_ => expect(hookCalled).to.eql(true));
        });

        it("should reject the promise if the hook throws", () => {
          articles = testCollection({
            hooks: {
              "incoming-changes": [
                function(changes) {
                  throw new Error("Invalid collection data");
                }
              ]
            }
          });

          return articles.pullChanges(result)
            .should.eventually.be.rejectedWith(Error, /Invalid collection data/);
        });

        it("should use the results of the hooks", () => {
          articles = testCollection({
            hooks: {
              "incoming-changes": [
                function(incoming) {
                  const returnedChanges = incoming;
                  const changes = returnedChanges.changes;

                  returnedChanges.changes = changes.map(r => {
                    r.foo = "bar";
                    return r;
                  });
                  return returnedChanges;
                }
              ]
            }
          });

          return articles.pullChanges(result)
            .then((result) => {
              expect(result.created.length).to.eql(2);
              result.created.forEach((r) => {
                expect(r.foo).to.eql("bar");
              });
              expect(result.updated.length).to.eql(2);
              result.updated.forEach((r) => {
                expect(r.foo).to.eql("bar");
              });
            });
        });

        it("should be able to chain hooks", () => {
          function hookFactory(fn) {
            return function(incoming) {
              const returnedChanges = incoming;
              const changes = returnedChanges.changes;
              returnedChanges.changes = changes.map(fn);
              return returnedChanges;
            };
          }
          articles = testCollection({
            hooks: {
              "incoming-changes": [
                hookFactory(r => {
                  r.foo = "bar";
                  return r;
                }),
                hookFactory(r => {
                  r.bar = "baz";
                  return r;
                }),]
            }
          });

          return articles.pullChanges(result)
            .then((result) => {
              expect(result.created.length).to.eql(2);
              result.created.forEach((r) => {
                expect(r.foo).to.eql("bar");
                expect(r.bar).to.eql("baz");
              });
              expect(result.updated.length).to.eql(2);
              result.updated.forEach((r) => {
                expect(r.foo).to.eql("bar");
                expect(r.bar).to.eql("baz");
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
                }
              ]
            }
          });

          return articles.pullChanges(result)
            .then(_ => {
              expect(passedCollection).to.eql(articles);
            });
        });
      });

      it("should not fetch remote records if result status isn't ok", () => {
        result.ok = false;
        return articles.pullChanges(result)
          .then(_ => sinon.assert.notCalled(listRecords));
      });

      it("should fetch remote changes from the server", () => {
        return articles.pullChanges(result)
          .then(_ => {
            sinon.assert.calledOnce(listRecords);
            sinon.assert.calledWithExactly(listRecords, {
              since: undefined,
              headers: {}
            });
          });
      });

      it("should use timestamp to fetch remote changes from the server", () => {
        return articles.pullChanges(result, {lastModified: 42})
          .then(_ => {
            sinon.assert.calledOnce(listRecords);
            sinon.assert.calledWithExactly(listRecords, {
              since: 42,
              headers: {}
            });
          });
      });

      it("should resolve with imported creations", () => {
        return articles.pullChanges(result)
          .then(res => res.created)
          .should.eventually.become([
            {id: id_3, title: "art3", _status: "synced"},
            {id: id_8, title: "art8", _status: "synced"},
          ]);
      });

      it("should resolve with imported updates", () => {
        return articles.pullChanges(result)
          .then(res => res.updated)
          .should.eventually.become([
            {id: id_7, title: "art7-b", _status: "synced"}
          ]);
      });

      it("should resolve with imported deletions", () => {
        return articles.pullChanges(result)
          .then(res => res.deleted)
          .should.eventually.become([
            {id: id_4}
          ]);
      });

      it("should resolve with no conflicts detected", () => {
        return articles.pullChanges(result)
          .then(res => res.conflicts)
          .should.eventually.become([]);
      });

      it("should actually import changes into the collection", () => {
        return articles.pullChanges(result)
          .then(_ => articles.list({order: "title"}))
          .then(res => res.data)
          .should.eventually.become([
            {id: id_1, title: "art1", _status: "synced"},
            {id: id_2, title: "art2", _status: "synced"},
            {id: id_3, title: "art3", _status: "synced"},
            {id: id_5, title: "art5", _status: "synced"},
            {id: id_7, title: "art7-b", _status: "synced"},
            {id: id_8, title: "art8", _status: "synced"},
          ]);
      });

      it("should skip deleted data missing locally", () => {
        return articles.pullChanges(result)
          .then(res => {
            expect(res.skipped).eql([
              {id: id_6, deleted: true},
              {id: id_9, title: "art9", _status: "deleted"}
            ]);
          });
      });

      it("should not list identical records as skipped", () => {
        return articles.pullChanges(result)
          .then(res => res.skipped)
          .should.eventually.not.contain({
            id: id_2,
            title: "art2",
            _status: "synced"
          });
      });

      describe("Error handling", () => {
        it("should expose any import transaction error", () => {
          const error = new Error("bad");
          sandbox.stub(articles.db, "execute")
            .returns(Promise.reject(error));

          return articles.pullChanges(result)
          .then(res => res.errors)
          .should.become([error]);
        });
      });
    });

    describe("When a conflict occured", () => {
      let createdId;

      beforeEach(() => {
        return articles.create({title: "art2"})
          .then(res => createdId = res.data.id);
      });

      it("should resolve listing conflicting changes with MANUAL strategy", () => {
        sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
          Promise.resolve({
            data: [
              {id: createdId, title: "art2mod"}, // will conflict with unsynced local record
            ],
            next: () => {},
            last_modified: "\"42\"",
          }));

        return articles.pullChanges(result)
          .should.eventually.become({
            ok: false,
            lastModified: 42,
            errors:    [],
            created:   [],
            updated:   [],
            deleted:   [],
            skipped:   [],
            published: [],
            conflicts: [{
              type: "incoming",
              local: {
                _status: "created",
                id: createdId,
                title: "art2",
              },
              remote: {
                id: createdId,
                title: "art2mod",
              }
            }],
            resolved:  [],
          });
      });
    });

    describe("When a resolvable conflict occured", () => {
      let createdId;

      beforeEach(() => {
        return articles.create({title: "art2"})
          .then(res => {
            createdId = res.data.id;
            sandbox.stub(KintoClientCollection.prototype, "listRecords").returns(
              Promise.resolve({
                data: [
                  {id: createdId, title: "art2"}, // resolvable conflict
                ],
                next: () => {},
                last_modified: "\"42\"",
              }));
          });
      });

      it("should resolve with solved changes", () => {
        return articles.pullChanges(result)
          .should.eventually.become({
            ok: true,
            lastModified: 42,
            errors:    [],
            created:   [],
            published: [],
            updated:   [{
              id: createdId,
              title: "art2",
              _status: "synced",
            }],
            skipped:   [],
            deleted:   [],
            conflicts: [],
            resolved:  [],
          });
      });
    });
  });

  /** @test {Collection#importChanges} */
  describe("#importChanges", () => {
    let articles, result;

    function createDecodeTransformer(char) {
      return {
        encode() {},
        decode(record) {
          return Object.assign({}, record, {title: record.title + char});
        }
      };
    }

    beforeEach(() => {
      articles = testCollection();
      result = new SyncResultObject();
    });

    it("should return errors when encountered", () => {
      const error = new Error("unknown error");
      sandbox.stub(articles, "list").returns(Promise.reject(error));

      return articles.importChanges(result, {changes: [{title: "bar"}]})
        .then(res => res.errors)
        .should.eventually.become([error]);
    });

    it("should return typed errors", () => {
      const error = new Error("unknown error");
      sandbox.stub(articles, "get").returns(Promise.reject(error));

      return articles.importChanges(result, {changes: [{title: "bar"}]})
        .then(res => res.errors[0])
        .should.eventually.have.property("type").eql("incoming");
    });

    it("should decode incoming encoded records using a single transformer", () => {
      articles = testCollection({
        remoteTransformers: [
          createDecodeTransformer("#")
        ]
      });

      return articles.importChanges(result, {changes: [{id: uuid4(), title: "bar"}]})
        .then(res => res.created[0].title)
        .should.become("bar#");
    });

    it("should decode incoming encoded records using multiple transformers", () => {
      articles = testCollection({
        remoteTransformers: [
          createDecodeTransformer("!"),
          createDecodeTransformer("?"),
        ]
      });

      return articles.importChanges(result, {changes: [{id: uuid4(), title: "bar"}]})
        .then(res => res.created[0].title)
        .should.become("bar?!"); // reversed because we decode in the opposite order
    });

    it("should only retrieve the changed record", () => {
      const id1 = uuid4();
      const id2 = uuid4();
      const list = sandbox.stub(articles, "list").returns(Promise.resolve());

      return articles.importChanges(result, {changes: [
        {id: id1, title: "foo"},
        {id: id2, title: "bar"},
      ]})
        .then(() => {
          sinon.assert.calledWithExactly(list, {
            filters: {id: [id1, id2]},
            order: ""
          }, {includeDeleted: true});
        });
    });
  });

  /** @test {Collection#pushChanges} */
  describe("#pushChanges", () => {
    let articles, records, result;

    beforeEach(() => {
      articles = testCollection();
      result = new SyncResultObject();
      return Promise.all([
        articles.create({title: "foo"}),
        articles.create({id: uuid4(), title: "bar"}, {synced: true}),
      ])
        .then(results => records = results.map(res => res.data));
    });

    it("should publish local changes to the server", () => {
      const batchRequests = sandbox.stub(KintoClient.prototype, "_batchRequests")
        .returns(Promise.resolve([{}]));

      return articles.pushChanges(result)
        .then(_ => {
          const requests = batchRequests.firstCall.args[0];
          const options = batchRequests.firstCall.args[1];
          expect(requests).to.have.length.of(1);
          expect(requests[0].body.data.title).eql("foo");
          expect(options.safe).eql(true);
        });
    });

    it("should batch send encoded records", () => {
      articles = testCollection({
        remoteTransformers: [
          createEncodeTransformer("?", 10),
          createEncodeTransformer("!", 5),
        ]
      });

      const batchRequests = sandbox.stub(KintoClient.prototype, "_batchRequests")
        .returns(Promise.resolve([{}]));

      return articles.pushChanges(result)
        .then(_ => {
          const requests = batchRequests.firstCall.args[0];
          expect(requests[0].body.data.title).eql("foo?!");
        });
    });

    it("should update published records local status", () => {
      sandbox.stub(KintoClientCollection.prototype, "batch").returns(Promise.resolve({
        published: [{data: records[0]}],
        errors:    [],
        conflicts: [],
        skipped:   [],
      }));
      return articles.pushChanges(result)
        .then(res => res.published)
        .should.eventually.become([
          {
            _status: "synced",
            id: records[0].id,
            title: "foo",
          }
        ]);
    });

    it("should not publish records created and deleted locally and never synced", () => {
      const batchRequests = sandbox.stub(KintoClient.prototype, "_batchRequests")
        .returns(Promise.resolve([]));

      return articles.delete(records[0].id)
        .then(_ => articles.pushChanges(result))
        .then(_ => {
          const requests = batchRequests.firstCall.args[0];
          expect(requests).eql([]);
        });
    });

    it("should delete unsynced virtually deleted local records", () => {
      const locallyDeletedId = records[0].id;
      sandbox.stub(KintoClientCollection.prototype, "batch").returns(Promise.resolve({
        published: [{data: {id: locallyDeletedId, deleted: true}}],
        errors:    [],
        conflicts: [],
        skipped:   [],
      }));
      return articles.delete(locallyDeletedId)
        .then(_ => articles.pushChanges(result))
        .then(_ => articles.get(locallyDeletedId, {includeDeleted: true}))
        .should.be.eventually.rejectedWith(Error, /not found/);
    });

    it("should delete locally the records deleted remotely", () => {
      sandbox.stub(KintoClientCollection.prototype, "batch").returns(Promise.resolve({
        published: [{data: Object.assign({}, records[1], {deleted: true})}],
        errors:    [],
        conflicts: [],
        skipped:   [],
      }));
      return articles.pushChanges(result)
        .then(res => res.published)
        .should.eventually.become([
          {
            id: records[1].id,
            deleted: true
          }
        ]);
    });

    it("should delete locally the records already deleted remotely", () => {
      sandbox.stub(KintoClientCollection.prototype, "batch").returns(Promise.resolve({
        published: [],
        errors:    [],
        conflicts: [],
        skipped:   [{data: {id: records[0].id}}]
      }));
      return articles.pushChanges(result)
        .then(_ => articles.get(records[0].id, {includeDeleted: true}))
        .should.be.eventually.rejectedWith(Error, /not found/);
    });

    describe("Error handling", () => {
      const error = new Error("publish error");

      beforeEach(() => {
        sandbox.stub(KintoClientCollection.prototype, "batch").returns(Promise.resolve({
          errors:    [error],
          published: [],
          conflicts: [],
          skipped:   [],
        }));
      });

      it("should report encountered publication errors", () => {
        return articles.pushChanges(result)
          .then(res => res.errors)
          .should.eventually.become([error]);
      });

      it("should report typed publication errors", () => {
        return articles.pushChanges(result)
          .then(res => res.errors[0])
          .should.eventually.have.property("type").eql("outgoing");
      });
    });
  });

  /** @test {Collection#resetSyncStatus} */
  describe("#resetSyncStatus", () => {
    const fixtures = [
      {id: uuid4(), last_modified: 42, title: "art1"},
      {id: uuid4(), last_modified: 42, title: "art2"},
      {id: uuid4(), last_modified: 42, title: "art3"},
    ];
    let articles;

    beforeEach(() => {
      articles = testCollection();
      return Promise.all(fixtures.map(fixture => {
        return articles.create(fixture, {synced: true});
      }))
      .then(_ => {
        return articles.delete(fixtures[1].id);
      });
    });

    it("should reset the synced status of all local records", () => {
      return articles.resetSyncStatus()
        .then(_ => articles.list({filters: {_status: "synced"}}))
        .should.eventually.have.property("data").to.have.length(0);
    });

    it("should garbage collect the locally deleted records", () => {
      return articles.resetSyncStatus()
        .then(_ => {
          return articles.list({
            filters: {_status: "deleted"}
          }, {includeDeleted: true});
        })
        .should.eventually.have.property("data").to.have.length(0);
    });

    it("should clear last modified value of all records", () => {
      return articles.resetSyncStatus()
        .then(_ => articles.list())
        .then(res => res.data.some(r => r.last_modified))
        .should.eventually.eql(false);
    });

    it("should clear any previously saved lastModified value", () => {
      return articles.resetSyncStatus()
        .then(_ => articles.db.getLastModified())
        .should.become(null);
    });

    it("should resolve with the number of local records processed ", () => {
      return articles.resetSyncStatus()
        .should.become(3);
    });
  });

  /** @test {Collection#sync} */
  describe("#sync", () => {
    const fixtures = [
      {title: "art1"},
      {title: "art2"},
      {title: "art3"},
    ];
    let articles, ids;

    beforeEach(() => {
      articles = testCollection();
      sandbox.stub(api, "batch").returns({
        errors:    [],
        published: [],
        conflicts: [],
        skipped:   [],
      });
      return Promise.all(fixtures.map(fixture => articles.create(fixture)))
        .then(res => ids = res.map(r => r.data.id));
    });

    it("should validate the remote option", () => {
      expect(() => articles.sync({remote: "http://fake.invalid"}))
        .to.Throw(Error, /contain the version/);
    });

    it("should use a custom remote option", () => {
      sandbox.stub(articles, "importChanges");
      sandbox.stub(articles, "pushChanges").returns(new SyncResultObject());
      const fetch = sandbox.stub(root, "fetch")
        .returns(fakeServerResponse(200, {data: []}, {}));

      return articles.sync({remote: "http://test/v1"}).
        then(res => {
          sinon.assert.calledWith(fetch, sinon.match(/http:\/\/test\/v1/));
        });
    });

    it("should revert the custom remote option on success", () => {
      sandbox.stub(articles, "importChanges");
      sandbox.stub(articles, "pushChanges").returns(new SyncResultObject());
      sandbox.stub(root, "fetch")
        .returns(fakeServerResponse(200, {data: []}, {}));

      return articles.sync({remote: "http://test/v1"}).
        then(_ => {
          expect(api.remote).eql(FAKE_SERVER_URL);
        });
    });

    it("should revert the custom remote option on failure", () => {
      sandbox.stub(articles, "importChanges");
      sandbox.stub(articles, "pushChanges").returns(Promise.reject("boom"));
      sandbox.stub(root, "fetch")
        .returns(fakeServerResponse(200, {data: []}, {}));

      return articles.sync({remote: "http://test/v1"}).
        catch(_ => {
          expect(api.remote).eql(FAKE_SERVER_URL);
        });
    });

    it("should load fixtures", () => {
      return articles.list()
        .then(res => res.data)
        .should.eventually.have.length.of(3);
    });

    it("should fetch latest changes from the server", () => {
      const listRecords = sandbox.stub(KintoClientCollection.prototype, "listRecords")
        .returns(Promise.resolve({
          last_modified: "\"42\"",
          next: () => {},
          data: []
        }));
      return articles.sync().then(res => {
        // Never synced so we fetch all the records from the server
        sinon.assert.calledWithMatch(listRecords, {since: undefined});
      });
    });

    it("should store latest lastModified value when no conflicts", () => {
      sandbox.stub(KintoClientCollection.prototype, "listRecords")
        .returns(Promise.resolve({
          last_modified: "\"42\"",
          next: () => {},
          data: []
        }));
      return articles.sync().then(res => {
        expect(articles.lastModified).eql(42);
      });
    });

    it("shouldn't store latest lastModified on conflicts", () => {
      sandbox.stub(KintoClientCollection.prototype, "listRecords")
        .returns(Promise.resolve({
          last_modified: "\"43\"",
          next: () => {},
          data: [{
            id: ids[0],
            title: "art1mod",
          }]
        }));
      return articles.sync().then(res => {
        expect(articles.lastModified).eql(null);
      });
    });

    it("shouldn't store latest lastModified on errors", () => {
      sandbox.stub(KintoClientCollection.prototype, "listRecords")
        .returns(Promise.resolve({
          last_modified: "\"43\"",
          next: () => {},
          data: [{
            id: ids[0],
            title: "art1mod",
          }]
        }));
      sandbox.stub(articles.db, "execute")
        .returns(Promise.reject(new Error("error")));
      return articles.sync().then(res => {
        expect(articles.lastModified).eql(null);
      });
    });

    it("should resolve early on pull failure", () => {
      const result = new SyncResultObject();
      result.add("conflicts", [1]);
      sandbox.stub(articles, "pullChanges").returns(Promise.resolve(result));
      return articles.sync()
        .should.eventually.become(result);
    });

    it("should not execute a last pull on push failure", () => {
      const pullResult = new SyncResultObject();
      const pushResult = new SyncResultObject();
      pushResult.add("conflicts", [1]);
      sandbox.stub(articles, "pullChanges").returns(Promise.resolve(pullResult));
      sandbox.stub(articles, "pushChanges").returns(Promise.resolve(pushResult));
      return articles.sync()
        .should.eventually.become(pushResult);
    });

    it("should not execute a last pull if nothing to push", () => {
      sandbox.stub(articles, "gatherLocalChanges")
        .returns(Promise.resolve({toDelete: [], toSync: []}));
      const pullChanges = sandbox.stub(articles, "pullChanges")
        .returns(Promise.resolve(new SyncResultObject()));
      return articles.sync().then(res => {
        sinon.assert.calledOnce(pullChanges);
      });
    });

    describe("Options", () => {
      let pullChanges;

      beforeEach(() => {
        pullChanges = sandbox.stub(articles, "pullChanges")
          .returns(Promise.resolve(new SyncResultObject()));
      });

      it("should transfer the headers option", () => {
        return articles.sync({headers: {Foo: "Bar"}})
          .then(() => {
            expect(pullChanges.firstCall.args[1]).eql({headers: {Foo: "Bar"}});
          });
      });

      it("should transfer the strategy option", () => {
        return articles.sync({strategy: Collection.strategy.SERVER_WINS})
          .then(() => {
            expect(pullChanges.firstCall.args[1]).eql({strategy: Collection.strategy.SERVER_WINS});
          });
      });
    });

    describe("Server backoff", () => {
      it("should reject on server backoff by default", () => {
        articles.api = {backoff: 30000};
        return articles.sync()
          .should.be.rejectedWith(Error, /back off; retry in 30s/);
      });

      it("should perform sync on server backoff when ignoreBackoff is true", () => {
        const result = new SyncResultObject();
        sandbox.stub(articles.db, "getLastModified").returns(Promise.resolve({}));
        sandbox.stub(articles, "pullChanges").returns(Promise.resolve(result));
        sandbox.stub(articles, "pushChanges").returns(Promise.resolve(result));
        articles.api = {backoff: 30};
        return articles.sync({ignoreBackoff: true})
          .then(_ => sinon.assert.calledOnce(articles.db.getLastModified));
      });
    });
  });
});
