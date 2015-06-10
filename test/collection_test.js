"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import { v4 as uuid4 } from "uuid";

import Collection from "../src/collection";
import Api from "../src/api";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_COLLECTION_NAME = "cliquetis-test";
const FAKE_SERVER_URL = "http://fake-server/v0"

describe("Collection", () => {
  var sandbox, api;
  const article = {title: "foo", url: "http://foo"};

  function testCollection() {
    api = new Api(FAKE_SERVER_URL);
    return new Collection(TEST_COLLECTION_NAME, api);
  }

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    return testCollection().clear();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("#open", () => {
    it("should fetch and update lastModified value", () => {
      sandbox.stub(Collection.prototype, "getLastModified")
        .returns(Promise.resolve(42))
      var articles = testCollection();

      return articles.open()
        .then(() => expect(articles.lastModified).eql(42));
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
    it("should create a record and return created record data", () => {
      return testCollection().create(article)
        .should.eventually.have.property("data");
    });

    it("should create a record and return created record perms", () => {
      return testCollection().create(article)
        .should.eventually.have.property("permissions");
    });

    it("should assign an id to the created record", () => {
      return testCollection().create(article)
        .then(result => result.data.id)
        .should.eventually.be.a("string");
    });

    it("should not alter original record", () => {
      return testCollection().create(article)
        .should.eventually.not.eql(article);
    });

    it("should add record status on creation", () => {
      var articles = testCollection();
      return articles.create(article)
        .then(res => res.data._status)
        .should.eventually.eql("created");
    });

    it("should reject if passed argument is not an object", () => {
      return testCollection().create(42)
        .should.eventually.be.rejectedWith(Error, /is not an object/);
    });

    it("should actually persist the record into the collection", () => {
      var articles = testCollection();
      return articles.create(article).then(result => {
        return articles.get(result.data.id).then(res => res.data.title);
      }).should.become(article.title);
    });
  });

  describe("#update", () => {
    it("should update a record", () => {
      var articles = testCollection();
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
      var articles = testCollection();
      return articles.create(article)
        .then(res => res.data)
        .then(data => articles.update(Object.assign({}, data, {title: "blah"})))
        .then(res => res.data._status)
        .should.eventually.eql("updated");
    });

    it("should reject updates on a non-existent record", () => {
      return testCollection().update({id: "non-existent"})
        .should.be.rejectedWith(Error, /not found/);
    });
  });

  describe("#get", () => {
    var uuid;

    beforeEach(() => {
      return testCollection().create(article)
        .then(result => uuid = result.data.id);
    });

    it("should retrieve a record from its id", () => {
      return testCollection().get(uuid)
        .then(res => res.data.title)
        .should.eventually.eql(article.title);
    });

    it("should have record status info attached", () => {
      return testCollection().get(uuid)
        .then(res => res.data._status)
        .should.eventually.eql("created");
    });

    it("should reject in case of record not found", () => {
      return testCollection().get("non-existent")
        .then(res => res.data)
        .should.be.rejectedWith(Error, /not found/);
    });

    it("should reject on virtually deleted record", () => {
      const articles = testCollection();
      return articles.delete(uuid)
        .then(res => articles.get(uuid))
        .should.be.rejectedWith(Error, /not found/);
    });
  });

  describe("#delete", () => {
    var uuid;

    beforeEach(() => {
      return testCollection().create(article)
        .then(result => uuid = result.data.id);
    });

    describe("Virtual", () => {
      it("should virtually delete a record", () => {
        var articles = testCollection();
        return articles.delete(uuid, {virtual: true})
          .then(res => articles.get(res.data.id, {includeDeleted: true}))
          .then(res => res.data._status)
          .should.eventually.eql("deleted");
      });

      it("should reject on non-existent record", () => {
        return testCollection().delete("non-existent", {virtual: true})
          .then(res => res.data)
          .should.eventually.be.rejectedWith(Error, /not found/);
      });
    });

    describe("Factual", () => {
      it("should factually delete a record", () => {
        return testCollection().delete(uuid, {virtual: false})
          .then(res => res.data)
          .should.eventually.eql({id: uuid});
      });

      it("should reject on non-existent record", () => {
        return testCollection().delete("non-existent", {virtual: false})
          .then(res => res.data)
          .should.eventually.be.rejectedWith(Error, /not found/);
      });
    });
  });

  describe("#list", () => {
    beforeEach(() => {
      var articles = testCollection();
      return Promise.all([
        articles.create(article),
        articles.create({title: "bar", url: "http://bar"})
      ]);
    });

    it("should retrieve the list of records", () => {
      return testCollection().list()
        .then(res => res.data)
        .should.eventually.have.length.of(2);
    });

    it("shouldn't list virtually deleted records", () => {
      const articles = testCollection();
      return articles.create({title: "yay"})
        .then(res => articles.delete(res.data.id))
        .then(_ => articles.list())
        .then(res => res.data)
        .should.eventually.have.length.of(2);
    });

    it("should support the includeDeleted option", () => {
      const articles = testCollection();
      return articles.create({title: "yay"})
        .then(res => articles.delete(res.data.id))
        .then(_ => articles.list({}, {includeDeleted: true}))
        .then(res => res.data)
        .should.eventually.have.length.of(3);
    });
  });

  describe("#pullChanges", () => {
    var articles;

    beforeEach(() => {
      articles = testCollection();
    });

    describe("When no conflicts occured", () => {
      const localData = [
        {id: 1, title: "art1"},
        {id: 2, title: "art2"},
        {id: 4, title: "art4"},
      ];
      const serverChanges = [
        {id: 2, title: "art2"},
        {id: 3, title: "art3"},    // to be created
        {id: 4, deleted: true},    // to be deleted
      ];

      beforeEach(() => {
        sandbox.stub(Api.prototype, "fetchChangesSince").returns(
          Promise.resolve({
            lastModified: 42,
            changes: serverChanges
          }));
        return Promise.all(localData.map(fixture => {
          return articles.create(fixture, {synced: true});
        }));
      });

      it("should resolve with imported changes", () => {
        return articles.pullChanges()
          .should.eventually.become({
            created:   [{id: 3, title: "art3", _status: "synced"}],
            updated:   [{id: 2, title: "art2", _status: "synced"}],
            deleted:   [{"id": 4}],
            conflicts: [],
          });
      });

      it("should actually import changes into the collection", () => {
        return articles.pullChanges()
          .then(_ => articles.list())
          .then(res => res.data)
          .should.eventually.become([
            {id: 1, title: "art1", _status: "synced"},
            {id: 2, title: "art2", _status: "synced"},
            {id: 3, title: "art3", _status: "synced"},
          ]);
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

      it("should reject with conflicting changes", () => {
        return articles.pullChanges()
          .catch(res => {
            return res;
          })
          .should.eventually.become({
            created: [],
            updated: [],
            deleted: [],
            conflicts: [{
              id: createdId,
              title: "art2mod"
            }]});
      });
    });
  });

  describe("#pushChanges", () => {
    it("should publish local changes to the server", () => {
      // TODO
    });
  });

  describe("#sync", () => {
    const fixtures = [
      {title: "art1"},
      {title: "art2"},
      {title: "art3"},
    ];
    var articles;

    beforeEach(() => {
      articles = testCollection();
      sandbox.stub(api, "batch").returns({
        errors:    [],
        published: [],
        conflicts: [],
      });
      return Promise.all(fixtures.map(fixture => articles.create(fixture)));
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

    it("should store latest lastModified value", () => {
      var fetchChangesSince = sandbox.stub(articles.api, "fetchChangesSince")
        .returns(Promise.resolve({
          lastModified: 42,
          changes: []
        }));
      return articles.sync().then(res => {
        expect(articles.lastModified).eql(42);
      });
    });
  });
});
