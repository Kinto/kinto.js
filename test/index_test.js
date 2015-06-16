"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import { v4 as uuid4 } from "uuid";

import Cliquetis from "../src";
import Collection from "../src/collection";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_COLLECTION_NAME = "cliquetis-test";
const FAKE_SERVER_URL = "http://fake-server"

describe("Cliquetis", () => {
  var sandbox;

  function testCollection() {
    return new Cliquetis({serverUrl: FAKE_SERVER_URL}).collection(TEST_COLLECTION_NAME);
  }

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    return testCollection().clear();
  });

  afterEach(() => {
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
      const db = new Cliquetis();
      expect(db.collection("a") == db.collection("a")).eql(true);
    });

    it("should reject on missing collection name", () => {
      expect(() => new Cliquetis().collection())
        .to.Throw(Error, /missing collection name/);
    });

    it("should setup the Api cient using default server URL", () => {
      const db = new Cliquetis();
      const coll = db.collection("plop");

      expect(coll.api.remote).eql("http://0.0.0.0:8888/v0");
    });

    it("should setup the Api cient using provided server URL", () => {
      const db = new Cliquetis({remote: "http://1.2.3.4:1234/v1"});
      const coll = db.collection("plop");

      expect(coll.api.remote).eql("http://1.2.3.4:1234/v1");
    });
  });
});
