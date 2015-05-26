import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";

import Cliquetis from "../src";

chai.use(chaiAsPromised);
chai.should();

const TEST_DB_NAME = "cliquetis-test";

describe("Cliquetis", function() {

  beforeEach(function (done) {
    const req = indexedDB.deleteDatabase(TEST_DB_NAME);
    req.onsuccess = event => done();
  });

  describe("#collection()", function() {
    it("should reject on missing collection name", function() {
      return new Cliquetis({dbName: TEST_DB_NAME})
        .collection().should.be.rejected;
    });

    it("should return a Promise", function() {
      return new Cliquetis({dbName: TEST_DB_NAME})
        .collection("bar").should.be.fulfilled;
    });

    it("should resolve to a named collection instance", function() {
      return new Cliquetis({dbName: TEST_DB_NAME})
        .collection("bar").should.eventually.have.property("name").eql("bar");
    });
  });

  describe("Collection", function() {
    const article = {title: "foo", url: "http://foo"};

    function testCollection() {
      return new Cliquetis({dbName: TEST_DB_NAME}).collection("articles");
    }

    describe("#add", function() {
      it("should save a record and return saved record data", function() {
        return testCollection().then(function(articles) {
          return articles.save(article);
        }).should.eventually.have.property("data");
      });

      it("should save a record and return saved record perms", function() {
        return testCollection().then(function(articles) {
          return articles.save(article);
        }).should.eventually.have.property("permissions");
      });

      it("should assign an id to the saved record", function() {
        return testCollection().then(function(articles) {
          return articles.save(article)
            .then(result => result.data.id);
        })
        .should.eventually.be.a("string");
      });

      it("should not alter original record", function() {
        return testCollection().then(function(articles) {
          return articles.save(article);
        })
        .should.eventually.not.eql(article);
      });

      it("should fail if record is not an object", function() {
        return testCollection().then(function(articles) {
          return articles.save(42);
        })
        .should.eventually.be.rejectedWith(Error, /is not an object/);
      });

      it("should actually persist the record in the db", function() {
        var articles;
        return testCollection().then(function(collection) {
          articles = collection;
          return articles.save(article);
        }).then(result => {
          return articles.get(result.data.id);
        }).should.eventually.be.fulfilled;
      });
    });

    describe("#update", function() {
      it("should update a record and return saved record data", function() {
        const existing = {id: "3.14", title: "foo", url: "http://foo"};

        return testCollection().then(function(articles) {
          return articles.save(existing)
            .then(result => result.data.id);
        }).should.eventually.eql("3.14");
      });
    });

    describe("#get", function() {
      var uuid;

      beforeEach(function() {
        return testCollection().then(articles => {
          return articles.save(article)
            .then(result => uuid = result.data.id);
        });
      });

      it("should retrieve a record from its id", function() {
        return testCollection().then(articles => {
          return articles.get(uuid).then(res => res.data);
        }).should.eventually.eql(Object.assign({}, article, {
          id: uuid
        }));
      });

      it("should reject in case of record not found", function() {
        return testCollection().then(articles => {
          return articles.get("nope").then(res => res.data);
        }).should.be.rejectedWith(Error, /not found/);
      });
    });
  });
});
