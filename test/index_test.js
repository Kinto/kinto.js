"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import { v4 as uuid4 } from "uuid";

import Cliquetis from "../src";
import Api, { cleanRecord } from "../src/api";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_COLLECTION_NAME = "cliquetis-test";
const root = typeof window === "object" ? window : global;

describe("Cliquetis", () => {
  var sandbox;

  function testCollection() {
    return new Cliquetis().collection(TEST_COLLECTION_NAME);
  }

  beforeEach(function() {
    sandbox = sinon.sandbox.create();
    return testCollection().clear();
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe("#collection()", () => {
    it("should return a Collection", () => {
      expect(testCollection()).to.be.a("object");
    });

    it("should resolve to a named collection instance", () => {
      expect(testCollection().name).eql(TEST_COLLECTION_NAME);
    });

    it("should cache collection instance", () => {
      var db = new Cliquetis();
      expect(db.collection("a") == db.collection("a")).eql(true);
    });

    it("should reject on missing collection name", () => {
      expect(() => new Cliquetis().collection())
        .to.Throw(Error, /missing collection name/);
    });
  });

  describe("Collection", () => {
    const article = {title: "foo", url: "http://foo"};

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

    describe("#update", function() {
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

      beforeEach(function() {
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
      beforeEach(function() {
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

    describe("#sync", () => {
      const fixtures = [
        {title: "art1"},
        {title: "art2"},
        {title: "art3"},
      ];
      var articles;

      beforeEach(function() {
        articles = testCollection();
        return Promise.all(fixtures.map(fixture => articles.create(fixture)));
      });

      it("should load fixtures", () => {
        return articles.list()
          .then(res => res.data)
          .should.eventually.have.length.of(3);
      });

      it("should fetch latest changes from the server", () => {
        var fetchChangesSince = sandbox.stub(Api.prototype, "fetchChangesSince")
          .returns(Promise.resolve([]));
        return articles.sync().then(res => {
          sinon.assert.calledOnce(fetchChangesSince);
        });
      });
    });

    describe("#importChangesLocally", () => {
      const fixtures = [
        {title: "art1"},
        {title: "art2"},
        {title: "art3"},
      ];
      const toImport = [
        {id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", title: "art4"},
        {id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", title: "art5"},
      ];
      var articles;

      beforeEach(function() {
        articles = testCollection();
        return Promise.all(fixtures.map(fixture => articles.create(fixture)));
      });

      it("should import non-conflicting new records into the collection", () => {
        return articles.importChangesLocally(toImport)
          .then(_ => articles.list())
          .should.eventually.have.length.of(5);
      });

      it("should resolve with non-conflicting added records information", () => {
        return articles.importChangesLocally(toImport)
          .should.eventually.become([
            {id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", title: "art4", _status: "synced"},
            {id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", title: "art5", _status: "synced"},
          ]);
      });
    });
  });

  describe("Api", () => {
    describe("#batch", () => {
      const operations = [
        {id: 1, title: "foo"},
        {id: 2, title: "bar"},
      ];
      var api;

      beforeEach(() => {
        sandbox.stub(global, "fetch");
        api = new Api("http://test/v0/articles");
      });

      it("should call the batch endpoint", () => {
        api.batch("create", operations);
        const requestOptions = fetch.getCall(0).args[1];

        sinon.assert.calledWithMatch(fetch, "http://test/v0/articles/batch");
      });

      it("should define default batch create request method", () => {
        api.batch("create", operations);
        const requestOptions = fetch.getCall(0).args[1];

        expect(requestOptions.body.defaults.method).eql("POST");
      });

      it("should define default batch update request method", () => {
        api.batch("update", operations);
        const requestOptions = fetch.getCall(0).args[1];

        expect(requestOptions.body.defaults.method).eql("PATCH");
      });

      it("should define default batch delete request method", () => {
        api.batch("delete", operations);
        const requestOptions = fetch.getCall(0).args[1];

        expect(requestOptions.body.defaults.method).eql("DELETE");
      });

      it("should define default batch request headers", () => {
        api.batch("create", operations);
        const requestOptions = fetch.getCall(0).args[1];

        expect(requestOptions.body.defaults.headers).eql({});
      });

      it("should send the expected number of request bodies", () => {
        api.batch("create", operations);
        const requestOptions = fetch.getCall(0).args[1];

        expect(requestOptions.body.requests).to.have.length.of(2);
      });

      it("should map created records to batch request bodies", () => {
        api.batch("create", operations);
        const requestOptions = fetch.getCall(0).args[1];

        expect(requestOptions.body.requests[0]).eql({
          path: "http://test/v0/articles/1",
          body: { id: 1, title: "foo" },
        });
      });
    });
  });
});
