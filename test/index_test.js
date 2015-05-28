import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";

import Cliquetis from "../src";

chai.use(chaiAsPromised);
chai.should();

const TEST_COLLECTION_NAME = "cliquetis-test";

describe("Cliquetis", function() {

  function testCollection() {
    return new Cliquetis().collection(TEST_COLLECTION_NAME);
  }

  beforeEach(function() {
    return testCollection().clear();
  });

  describe("#collection()", function() {
    it("should return a Collection", function() {
      expect(testCollection()).to.be.a("object");
    });

    it("should resolve to a named collection instance", function() {
      expect(testCollection().name).eql(TEST_COLLECTION_NAME);
    });

    it("should reject on missing collection name", function() {
      expect(function() {
        new Cliquetis().collection();
      }).to.Throw(Error, /missing collection name/);
    });
  });

  describe("Collection", function() {
    const article = {title: "foo", url: "http://foo"};

    describe("#save", function() {
      it("should save a record and return saved record data", function() {
        return testCollection().save(article)
          .should.eventually.have.property("data");
      });

      it("should save a record and return saved record perms", function() {
        return testCollection().save(article)
          .should.eventually.have.property("permissions");
      });

      it("should assign an id to the saved record", function() {
        return testCollection().save(article)
          .then(result => result.data.id)
          .should.eventually.be.a("string");
      });

      it("should not alter original record", function() {
        return testCollection().save(article)
          .should.eventually.not.eql(article);
      });

      it("should reject if passed argument is not an object", function() {
        return testCollection().save(42)
          .should.eventually.be.rejectedWith(Error, /is not an object/);
      });

      it("should actually persist the record into the collection", function() {
        var articles = testCollection();
        return articles.save(article).then(result => {
          return articles.get(result.data.id).then(res => res.data.title);
        }).should.become(article.title);
      });

      it("should update a record", function() {
        var articles = testCollection();
        return articles.save(article)
          .then(res => articles.get(res.data.id))
          .then(res => res.data)
          .then(existing => {
            return articles.save(Object.assign({}, existing, {title: "new title"}))
          })
          .then(res => articles.get(res.data.id))
          .then(res => res.data.title)
          .should.become("new title");
      });

      it("should reject updates on a non-existent record", function() {
        return testCollection().save({id: "non-existent"})
          .should.be.rejectedWith(Error, /not found/);
      });
    });

    describe("#get", function() {
      var uuid;

      beforeEach(function() {
        return testCollection().save(article)
          .then(result => uuid = result.data.id);
      });

      it("should retrieve a record from its id", function() {
        return testCollection().get(uuid)
          .then(res => res.data)
          .should.eventually.eql(Object.assign({}, article, {id: uuid}));
      });

      it("should reject in case of record not found", function() {
        return testCollection().get("non-existent")
          .then(res => res.data)
          .should.be.rejectedWith(Error, /not found/);
      });
    });

    describe("#delete", function() {
      var uuid;

      beforeEach(function() {
        return testCollection().save(article)
          .then(result => uuid = result.data.id);
      });

      it("should delete a record", function() {
        return testCollection().delete(uuid)
          .then(res => res.data)
          .should.eventually.eql({id: uuid, deleted: true});
      });

      it("should reject on non-existent record", function() {
        return testCollection().delete("non-existent")
          .then(res => res.data)
          .should.eventually.be.rejectedWith(Error, /not found/);
      });
    });

    describe("#list", function() {
      beforeEach(function() {
        var articles = testCollection();
        return Promise.all([
          articles.save(article),
          articles.save({title: "bar", url: "http://bar"})
        ]);
      });

      it("should retrieve the list of records", function() {
        return testCollection().list()
          .then(res => res.data)
          .should.eventually.have.length.of(2);
      });
    });
  });
});
