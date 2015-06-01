"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";

import Cliquetis from "../src";
import Api from "../src/api";

chai.use(chaiAsPromised);
chai.should();

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

    describe("#save", () => {
      it("should save a record and return saved record data", () => {
        return testCollection().save(article)
          .should.eventually.have.property("data");
      });

      it("should save a record and return saved record perms", () => {
        return testCollection().save(article)
          .should.eventually.have.property("permissions");
      });

      it("should assign an id to the saved record", () => {
        return testCollection().save(article)
          .then(result => result.data.id)
          .should.eventually.be.a("string");
      });

      it("should not alter original record", () => {
        return testCollection().save(article)
          .should.eventually.not.eql(article);
      });

      it("should add record status on create", () => {
        var articles = testCollection();
        return articles.save(article)
          .then(res => res.data._status)
          .should.eventually.eql("created");
      });

      it("should reject if passed argument is not an object", () => {
        return testCollection().save(42)
          .should.eventually.be.rejectedWith(Error, /is not an object/);
      });

      it("should actually persist the record into the collection", () => {
        var articles = testCollection();
        return articles.save(article).then(result => {
          return articles.get(result.data.id).then(res => res.data.title);
        }).should.become(article.title);
      });

      it("should update a record", () => {
        var articles = testCollection();
        return articles.save(article)
          .then(res => articles.get(res.data.id))
          .then(res => res.data)
          .then(existing => {
            return articles.save(
              Object.assign({}, existing, {title: "new title"}))
          })
          .then(res => articles.get(res.data.id))
          .then(res => res.data.title)
          .should.become("new title");
      });

      it("should update record status on update", () => {
        var articles = testCollection();
        return articles.save(article)
          .then(res => res.data)
          .then(data => articles.save(Object.assign({}, data, {title: "blah"})))
          .then(res => res.data._status)
          .should.eventually.eql("updated");
      });

      it("should reject updates on a non-existent record", () => {
        return testCollection().save({id: "non-existent"})
          .should.be.rejectedWith(Error, /not found/);
      });
    });

    describe("#get", () => {
      var uuid;

      beforeEach(function() {
        return testCollection().save(article)
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
        return testCollection().save(article)
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
          articles.save(article),
          articles.save({title: "bar", url: "http://bar"})
        ]);
      });

      it("should retrieve the list of records", () => {
        return testCollection().list()
          .then(res => res.data)
          .should.eventually.have.length.of(2);
      });

      it("shouldn't list virtually deleted records", () => {
        const articles = testCollection();
        return articles.save({title: "yay"})
          .then(res => articles.delete(res.data.id))
          .then(_ => articles.list())
          .then(res => res.data)
          .should.eventually.have.length.of(2);
      });

      it("should support the includeDeleted option", () => {
        const articles = testCollection();
        return articles.save({title: "yay"})
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
        return Promise.all(fixtures.map(articles.save.bind(articles)));
      });

      it("should load fixtures", () => {
        return articles.list()
          .then(res => res.data)
          .should.eventually.have.length.of(3);
      });

      it("should batch send local unsynced data to the server", () => {
        var batch = sandbox.stub(Api.prototype, "batch")
          .returns(Promise.resolve());
        return articles.sync().then(res => {
          sinon.assert.calledThrice(batch);
          sinon.assert.calledWith(batch, "create");
          sinon.assert.calledWith(batch, "update");
          sinon.assert.calledWith(batch, "delete");
        });
      });
    });
  });

  describe("Api", function() {
    describe("#batch", function() {
      const operations = [
        {id: 1, title: "foo"},
        {id: 2, title: "bar"},
      ];
      var api;

      beforeEach(() => {
        sandbox.stub(global, "fetch");
        api = new Api("http://test/v0/articles");
      });

      it("should call the batch endpoint", function() {
        api.batch("create", operations);
        const requestOptions = fetch.getCall(0).args[1];

        sinon.assert.calledWithMatch(fetch, "http://test/v0/articles/batch");
      });

      it("should define default batch create request method", function() {
        api.batch("create", operations);
        const requestOptions = fetch.getCall(0).args[1];

        expect(requestOptions.body.defaults.method).eql("POST");
      });

      it("should define default batch update request method", function() {
        api.batch("update", operations);
        const requestOptions = fetch.getCall(0).args[1];

        expect(requestOptions.body.defaults.method).eql("PATCH");
      });

      it("should define default batch delete request method", function() {
        api.batch("delete", operations);
        const requestOptions = fetch.getCall(0).args[1];

        expect(requestOptions.body.defaults.method).eql("DELETE");
      });

      it("should define default batch request headers", function() {
        api.batch("create", operations);
        const requestOptions = fetch.getCall(0).args[1];

        expect(requestOptions.body.defaults.headers).eql({});
      });

      it("should send the expected number of request bodies", function() {
        api.batch("create", operations);
        const requestOptions = fetch.getCall(0).args[1];

        expect(requestOptions.body.requests).to.have.length.of(2);
      });

      it("should map created records to batch request bodies", function() {
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
