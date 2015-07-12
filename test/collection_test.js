"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import { v4 as uuid4 } from "uuid";

import Collection, { SyncResultObject } from "../src/collection";
import Api, { cleanRecord } from "../src/api";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_BUCKET_NAME = "kinto-test";
const TEST_COLLECTION_NAME = "kinto-test";
const FAKE_SERVER_URL = "http://fake-server/v1"

describe("Collection", () => {
  var sandbox, api;
  const article = {title: "foo", url: "http://foo"};

  function testCollection() {
    api = new Api(FAKE_SERVER_URL);
    return new Collection(TEST_BUCKET_NAME, TEST_COLLECTION_NAME, api);
  }

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    return testCollection().clear();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("#open", () => {
    it("should resolve with current instance", () => {
      var articles = testCollection();

      return articles.open()
        .then(res => expect(res).eql(articles));
    });
  });

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
    });
  });

  describe("#saveLastModified", () => {
    var articles;

    beforeEach(() => articles = testCollection());

    it("should resolve with lastModified value", () => {
      return articles.saveLastModified(42)
        .should.eventually.become(42);
    });

    it("should save a lastModified value", () => {
      return articles.saveLastModified(42)
        .then(_ => articles.getLastModified())
        .should.eventually.become(42);
    });

    it("should update instance lastModified property value", () => {
      return articles.saveLastModified(42)
        .then(val => expect(articles.lastModified).eql(val));
    });

    it("should allow updating previous value", () => {
      return articles.saveLastModified(42)
        .then(_ => articles.saveLastModified(43))
        .then(_ => articles.getLastModified())
        .should.eventually.become(43);
    });
  });

  describe("#create", () => {
    var articles;

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

    it("should support the forceUUID option", () => {
      return articles.create({id: 42, title: "foo"}, {forceUUID: true})
        .then(result => articles.get(result.data.id))
        .then(res => res.data.id)
        .should.become(42);
    });

    it("should reject on transaction error", function() {
      sandbox.stub(articles, "prepare").returns({
        store: {add() {}},
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({target: {error: "transaction error"}})
          }
        }
      });
      return articles.create({foo: "bar"})
        .should.be.rejectedWith(Error, "transaction error");
    });

    it("should prefix error encountered", () => {
      sandbox.stub(articles, "open").returns(Promise.reject("error"));
      return articles.create().should.be.rejectedWith(Error, /^create/);
    });
  });

  describe("#update", () => {
    var articles;

    beforeEach(() => articles = testCollection());

    it("should update a record", () => {
      return articles.create(article)
        .then(res => articles.get(res.data.id))
        .then(res => res.data)
        .then(existing => {
          return articles.update(
            Object.assign({}, existing, {title: "new title"}))
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
      return articles.update({id: "non-existent"})
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

    it("should reject on transaction error", function() {
      sandbox.stub(articles, "get").returns(Promise.resolve());
      sandbox.stub(articles, "prepare").returns({
        store: {get() {}, put() {}},
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({target: {error: "transaction error"}})
          }
        }
      });
      return articles.update({id: 1, foo: "bar"})
        .should.be.rejectedWith(Error, "transaction error");
    });

    it("should prefix error encountered", () => {
      sandbox.stub(articles, "open").returns(Promise.reject("error"));
      return articles.update().should.be.rejectedWith(Error, /^update/);
    });
  });

  describe("#resolve", () => {
    var articles, local;

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

  describe("#get", () => {
    var articles, uuid;

    beforeEach(() => {
      articles = testCollection();
      return articles.create(article)
        .then(result => uuid = result.data.id);
    });

    it("should isolate records by bucket", () => {
      const otherbucket = new Collection('other', TEST_COLLECTION_NAME, api);
      return otherbucket.get(uuid)
        .then(res => res.data)
        .should.be.rejectedWith(Error, /not found/);
    });

    it("should retrieve a record from its id", () => {
      return articles.get(uuid)
        .then(res => res.data.title)
        .should.eventually.eql(article.title);
    });

    it("should have record status info attached", () => {
      return articles.get(uuid)
        .then(res => res.data._status)
        .should.eventually.eql("created");
    });

    it("should reject in case of record not found", () => {
      return articles.get("non-existent")
        .then(res => res.data)
        .should.be.rejectedWith(Error, /not found/);
    });

    it("should reject on virtually deleted record", () => {
      return articles.delete(uuid)
        .then(res => articles.get(uuid, {includeDeleted: true}))
        .then(res => res.data)
        .should.eventually.become({
          _status: "deleted",
          id: uuid,
          title: "foo",
          url: "http://foo",
        });
    });

    it("should support the includeDeleted option", () => {
      // body...
    });

    it("should reject on transaction error", function() {
      sandbox.stub(articles, "prepare").returns({
        store: {get() {}},
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({target: {error: "transaction error"}})
          }
        }
      });
      return articles.get(1)
        .should.be.rejectedWith(Error, "transaction error");
    });

    it("should prefix error encountered", () => {
      sandbox.stub(articles, "open").returns(Promise.reject("error"));
      return articles.get().should.be.rejectedWith(Error, /^get/);
    });
  });

  describe("#delete", () => {
    var articles, uuid;

    beforeEach(() => {
      articles = testCollection();
      return articles.create(article)
        .then(result => uuid = result.data.id);
    });

    describe("Virtual", () => {
      it("should virtually delete a record", () => {
        return articles.delete(uuid, {virtual: true})
          .then(res => articles.get(res.data.id, {includeDeleted: true}))
          .then(res => res.data._status)
          .should.eventually.eql("deleted");
      });

      it("should resolve with an already deleted record data", () => {
        return articles.delete(uuid, {virtual: true})
          .then(res => articles.delete(uuid, {virtual: true}))
          .then(res => res.data.id)
          .should.eventually.eql(uuid);
      });

      it("should reject on non-existent record", () => {
        return articles.delete("non-existent", {virtual: true})
          .then(res => res.data)
          .should.eventually.be.rejectedWith(Error, /not found/);
      });

      it("should prefix error encountered", () => {
        sandbox.stub(articles, "open").returns(Promise.reject("error"));
        return articles.delete().should.be.rejectedWith(Error, /^delete/);
      });
    });

    describe("Factual", () => {
      it("should factually delete a record", () => {
        return articles.delete(uuid, {virtual: false})
          .then(res => articles.get(res.data.id))
          .should.eventually.be.rejectedWith(Error, /not found/);
      });

      it("should resolve with deletion information", () => {
        return articles.delete(uuid, {virtual: false})
          .then(res => res.data)
          .should.eventually.eql({id: uuid});
      });

      it("should reject on non-existent record", () => {
        return articles.delete("non-existent", {virtual: false})
          .then(res => res.data)
          .should.eventually.be.rejectedWith(Error, /not found/);
      });
    });

    it("should reject on transaction error", function() {
      sandbox.stub(articles, "get").returns(Promise.resolve());
      sandbox.stub(articles, "prepare").returns({
        store: {delete() {}},
        transaction: {
          get onerror() {},
          set onerror(onerror) {
            onerror({target: {error: "transaction error"}})
          }
        }
      });
      return articles.delete(1, {virtual: false})
        .should.be.rejectedWith(Error, "transaction error");
    });
  });

  describe("#list", () => {
    var articles;

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

      it("should prefix error encountered", () => {
        sandbox.stub(articles, "open").returns(Promise.reject("error"));
        return articles.list().should.be.rejectedWith(Error, /^list/);
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
        {title: "art3", last_modified: 1, unread: true, complete: false},
      ];

      beforeEach(() => {
        articles = testCollection();
        return Promise.all(fixtures.map(r => articles.create(r)));
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

      it("should filter records on multiple fields", () => {
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

    describe("Error handling", function() {
      var articles;

      beforeEach(() => {
        articles = testCollection();
      });

      it("should reject on transaction error", function() {
        sandbox.stub(articles, "prepare").returns({
          store: {openCursor() {return {}}},
          transaction: {
            get onerror() {},
            set onerror(onerror) {
              onerror({target: {error: "transaction error"}})
            }
          }
        });
        return articles.list({})
          .should.be.rejectedWith(Error, "transaction error");
      });
    });
  });

  describe("#pullChanges", () => {
    var fetchChangesSince, articles, result;

    beforeEach(() => {
      articles = testCollection();
      result = new SyncResultObject();
    });

    describe("When no conflicts occured", () => {
      const localData = [
        {id: 1, title: "art1"},
        {id: 2, title: "art2"},
        {id: 4, title: "art4"},
        {id: 5, title: "art5"},
      ];
      const serverChanges = [
        {id: 2, title: "art2"}, // existing, should simply be marked as synced
        {id: 3, title: "art3"}, // to be created
        {id: 4, deleted: true}, // to be deleted
        {id: 6, deleted: true}, // remotely deleted, missing locally
      ];

      beforeEach(() => {
        fetchChangesSince = sandbox.stub(Api.prototype, "fetchChangesSince").returns(
          Promise.resolve({
            lastModified: 42,
            changes: serverChanges
          }));
        return Promise.all(localData.map(fixture => {
          return articles.create(fixture, {synced: true});
        }));
      });

      it("should fetch remote changes from the server", () => {
        return articles.pullChanges(result)
          .then(_ => {
            sinon.assert.calledOnce(fetchChangesSince);
            sinon.assert.calledWithExactly(fetchChangesSince,
              TEST_BUCKET_NAME,
              TEST_COLLECTION_NAME,
              {lastModified: null});
          });
      });

      it("should use timestamp to fetch remote changes from the server", () => {
        return articles.pullChanges(result, {lastModified: 42})
          .then(_ => {
            sinon.assert.calledOnce(fetchChangesSince);
            sinon.assert.calledWithExactly(fetchChangesSince,
              TEST_BUCKET_NAME,
              TEST_COLLECTION_NAME,
              {lastModified: 42});
          });
      });

      it("should resolve with imported creations", () => {
        return articles.pullChanges(result)
          .then(res => res.created)
          .should.eventually.become([
            {id: 3, title: "art3", _status: "synced"}
          ]);
      });

      it("should resolve with imported updates", () => {
        return articles.pullChanges(result)
          .then(res => res.updated)
          .should.eventually.become([
            {id: 2, title: "art2", _status: "synced"}
          ]);
      });

      it("should resolve with imported deletions", () => {
        return articles.pullChanges(result)
          .then(res => res.deleted)
          .should.eventually.become([
            {id: 4}
          ]);
      });

      it("should resolve with no conflicts detected", () => {
        return articles.pullChanges(result)
          .then(res => res.conflicts)
          .should.eventually.become([]);
      });

      it("should actually import changes into the collection", () => {
        return articles.pullChanges(result)
          .then(_ => articles.list())
          .then(res => res.data)
          .should.eventually.become([
            {id: 1, title: "art1", _status: "synced"},
            {id: 2, title: "art2", _status: "synced"},
            {id: 3, title: "art3", _status: "synced"},
            {id: 5, title: "art5", _status: "synced"},
          ]);
      });

      it("should skip already locally deleted data", () => {
        return articles.create({title: "foo"})
          .then(res => articles.delete(res.data.id))
          .then(res => articles._importChange({id: res.data.id, deleted: true}))
          .then(res => res.data.title)
          .should.eventually.become("foo");
      });
    });

    describe("When a conflict occured", () => {
      var createdId;

      beforeEach(() => {
        return articles.create({title: "art2"})
          .then(res => {
            createdId = res.data.id;
            sandbox.stub(Api.prototype, "fetchChangesSince").returns(
              Promise.resolve({
                lastModified: 42,
                changes: [
                  {id: createdId, title: "art2mod"}, // will conflict with unsynced local record
                ]
              }));
          });
      });

      it("should resolve listing conflicting changes", () => {
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
            }]});
      });
    });

    describe("When a resolvable conflict occured", () => {
      var createdId;

      beforeEach(() => {
        return articles.create({title: "art2"})
          .then(res => {
            createdId = res.data.id;
            sandbox.stub(Api.prototype, "fetchChangesSince").returns(
              Promise.resolve({
                lastModified: 42,
                changes: [
                  {id: createdId, title: "art2"}, // resolvable conflict
                ]
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
            updated: [{
              id: createdId,
              title: "art2",
              _status: "synced",
            }],
            skipped: [],
            deleted: [],
            conflicts: []});
      });
    });
  });

  describe("#importChanges", () => {
    var articles, result;

    beforeEach(() => {
      articles = testCollection();
      result = new SyncResultObject();
    });

    it("should return errors when encountered", () => {
      sandbox.stub(articles, "get").returns(Promise.reject("unknown error"));

      return articles.importChanges(result, {changes: [
        {foo: "bar"}
      ]})
        .then(res => res.errors)
        .should.eventually.become(["unknown error"]);
    });
  });

  describe("#pushChanges", () => {
    var articles, records, result;

    beforeEach(() => {
      articles = testCollection();
      result = new SyncResultObject();
      return Promise.all([
        articles.create({title: "foo"}),
        articles.create({id: "fake-uuid", title: "bar"}, {synced: true}),
      ])
        .then(results => records = results.map(res => res.data));
    });

    it("should publish local changes to the server", () => {
      var batch = sandbox.stub(articles.api, "batch").returns(Promise.resolve({
        published: [],
        errors:    [],
        conflicts: [],
      }));
      return articles.pushChanges(result)
        .then(_ => {
          sinon.assert.calledOnce(batch);
          sinon.assert.calledWithExactly(batch,
            TEST_BUCKET_NAME,
            TEST_COLLECTION_NAME,
            sinon.match(v => v.length === 1 && v[0].title === "foo"),
            { safe: true });
        });
    });

    it("should update published records local status", () => {
      var batch = sandbox.stub(articles.api, "batch").returns(Promise.resolve({
        published: [records[0]]
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

    it("should delete unsynced virtually deleted local records", () => {
      return articles.delete(records[0].id)
        .then(_ => articles.pushChanges(result))
        .then(_ => articles.get(records[0].id, {includeDeleted: true}))
        .should.be.eventually.rejectedWith(Error, /not found/);
    });

    it("should locally delete remotely deleted records", () => {
      var batch = sandbox.stub(articles.api, "batch").returns(Promise.resolve({
        published: [Object.assign({}, records[1], {deleted: true})]
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
  });

  describe("#sync", () => {
    const fixtures = [
      {title: "art1"},
      {title: "art2"},
      {title: "art3"},
    ];
    var articles, ids;

    beforeEach(() => {
      articles = testCollection();
      sandbox.stub(api, "batch").returns({
        errors:    [],
        published: [],
        conflicts: [],
      });
      return Promise.all(fixtures.map(fixture => articles.create(fixture)))
        .then(res => ids = res.map(r => r.data.id));
    });

    it("should load fixtures", () => {
      return articles.list()
        .then(res => res.data)
        .should.eventually.have.length.of(3);
    });

    it("should fetch latest changes from the server", () => {
      var fetchChangesSince = sandbox.stub(articles.api, "fetchChangesSince")
        .returns(Promise.resolve({
          lastModified: 42,
          changes: []
        }));
      return articles.sync().then(res => {
        sinon.assert.calledTwice(fetchChangesSince);
      });
    });

    it("should store latest lastModified value when no conflicts", () => {
      sandbox.stub(articles.api, "fetchChangesSince")
        .returns(Promise.resolve({
          lastModified: 42,
          changes: []
        }));
      return articles.sync().then(res => {
        expect(articles.lastModified).eql(42);
      });
    });

    it("shouldn't store latest lastModified on conflicts", () => {
      sandbox.stub(articles.api, "fetchChangesSince")
        .returns(Promise.resolve({
          lastModified: 43,
          changes: [{
            id: ids[0],
            title: "art1mod",
          }]
        }));
      return articles.sync().then(res => {
        expect(articles.lastModified).eql(42);
      });
    });

    it("should resolve early on pull failure", () => {
      const result = new SyncResultObject();
      result.add("conflicts", [1]);
      sandbox.stub(articles, "pullChanges").returns(Promise.resolve(result));
      return articles.sync()
        .should.eventually.become(result);
    });

    it("should transfer the headers option", () => {
      var pullChanges = sandbox.stub(articles, "pullChanges").returns(Promise.resolve({}));
      return articles.sync({headers: {Foo: "Bar"}})
        .then(() => {
          expect(pullChanges.firstCall.args[1]).eql({headers: {Foo: "Bar"}});
        })
    });

    it("should transfer the strategy option", () => {
      var pullChanges = sandbox.stub(articles, "pullChanges").returns(Promise.resolve({}));
      return articles.sync({strategy: Collection.strategy.SERVER_WINS})
        .then(() => {
          expect(pullChanges.firstCall.args[1]).eql({strategy: Collection.strategy.SERVER_WINS});
        })
    });
  });
});
