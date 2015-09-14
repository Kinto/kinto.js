"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import { EventEmitter } from "events";
import { SUPPORTED_PROTOCOL_VERSION as SPV } from "../src/api";

import Collection from "../src/collection";
import BaseAdapter from "../src/adapters/base";
import LocalStorage from "../src/adapters/LocalStorage";
import IDB from "../src/adapters/IDB";
import RemoteTransformer from "../src/transformers/remote";
import Kinto from "../src";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_BUCKET_NAME = "kinto-test";
const TEST_COLLECTION_NAME = "kinto-test";

describe("Kinto", () => {
  var sandbox;

  function testCollection() {
    const db = new Kinto({bucket: TEST_BUCKET_NAME});
    return db.collection(TEST_COLLECTION_NAME);
  }

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    return testCollection().clear();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("static properties", () => {
    describe("get adapters()", () => {
      it("should provide an adapters static getter", () => {
        expect(Kinto.adapters).to.be.an("object");
      });

      it("should provide an adapters.BaseAdapter getter", () => {
        expect(Kinto.adapters.BaseAdapter).to.eql(BaseAdapter);
      });

      it("should provide an adapters.LocalStorage getter", () => {
        expect(Kinto.adapters.LocalStorage).to.eql(LocalStorage);
      });

      it("should provide an adapters.IDB getter", () => {
        expect(Kinto.adapters.IDB).to.eql(IDB);
      });
    });

    describe("get transformers()", () => {
      it("should provide a transformers static getter", () => {
        expect(Kinto.transformers).to.be.an("object");
      });

      it("should provide a transformers.BaseAdapter getter", () => {
        expect(Kinto.transformers.RemoteTransformer).to.eql(RemoteTransformer);
      });
    });

    describe("get syncStrategy()", () => {
      it("should provide a syncStrategy static getter", () => {
        expect(Kinto.syncStrategy).eql(Collection.strategy);
      });
    });
  });

  describe("static methods", () => {
    describe("createRemoteTransformer", () => {
      it("should require a prototype object", () => {
        expect(() => Kinto.createRemoteTransformer()).to.Throw(Error, /prototype/);
      });

      it("should allow defining a remote transformer", () => {
        const Transformer = Kinto.createRemoteTransformer({});

        expect(new Transformer()).to.be.an.instanceOf(RemoteTransformer);
      });

      it("should expose custom remote transformer prototype", () => {
        const encode = function(){};
        const Transformer = Kinto.createRemoteTransformer({encode: encode});

        expect(new Transformer().encode).eql(encode);
      });

      it("should not share custom prototypes across transformers", () => {
        const encodeA = function(){};
        const encodeB = function(){};
        const TransformerA = Kinto.createRemoteTransformer({encode: encodeA});
        const TransformerB = Kinto.createRemoteTransformer({encode: encodeB});

        expect(new TransformerA().encode).eql(encodeA);
        expect(new TransformerB().encode).eql(encodeB);
      });

      it("should use custom prototype constructor", () => {
        const Transformer = Kinto.createRemoteTransformer({
          constructor: function(x) {
            this.x = x;
          }
        });

        expect(new Transformer(42).x).eql(42);
      });
    });
  });

  describe("#constructor", () => {
    it("should expose a passed events instance", () => {
      const events = new EventEmitter();
      expect(new Kinto({events}).events).to.eql(events);
    });

    it("should create an events property if none passed", () => {
      expect(new Kinto().events).to.be.an.instanceOf(EventEmitter);
    });

    it("should propagate its events property to child dependencies", () => {
      const kinto = new Kinto();
      expect(kinto.collection("x").events).eql(kinto.events);
      expect(kinto.collection("x").api.events).eql(kinto.events);
      expect(kinto.collection("x").api.http.events).eql(kinto.events);
    });

    it("should propagate the requestMode option to child dependencies", () => {
      const requestMode = "no-cors";
      expect(new Kinto({requestMode}).collection("x").api.http.requestMode)
        .eql(requestMode);
    });

    it("should propagate the dbPrefix option to child dependencies", () => {
      expect(new Kinto({dbPrefix: "app--"}).collection("x").db.dbname)
        .eql("app--default/x");
    });
  });

  describe("#collection()", () => {
    it("should return a Collection", () => {
      expect(testCollection()).to.be.a("object");
    });

    it("should resolve to a named collection instance", () => {
      expect(testCollection().name).eql(TEST_COLLECTION_NAME);
    });

    it("should use specified bucket name if specified", () => {
      expect(testCollection().bucket).eql(TEST_BUCKET_NAME);
    });

    it("should use default bucket if not specified", () => {
      const coll = new Kinto().collection(TEST_COLLECTION_NAME);
      expect(coll.bucket).eql("default");
    });

    it("should reject on missing collection name", () => {
      expect(() => new Kinto().collection())
        .to.Throw(Error, /missing collection name/);
    });

    it("should setup the Api cient using default server URL", () => {
      const db = new Kinto();
      const coll = db.collection("plop");

      expect(coll.api.remote).eql(`http://localhost:8888/${SPV}`);
    });

    it("should setup the Api cient using provided server URL", () => {
      const db = new Kinto({remote: `http://1.2.3.4:1234/${SPV}`});
      const coll = db.collection("plop");

      expect(coll.api.remote).eql(`http://1.2.3.4:1234/${SPV}`);
    });

    it("should pass option headers to the api", () => {
      const db = new Kinto({
        remote: `http://1.2.3.4:1234/${SPV}`,
        headers: {Authorization: "Basic plop"},
      });
      const coll = db.collection("plop");

      expect(coll.api.optionHeaders).eql({Authorization: "Basic plop"});
    });

    it("should create collection using an optional adapter", () => {
      const MyAdapter = class extends BaseAdapter {};
      const db = new Kinto({adapter: MyAdapter});
      const coll = db.collection("plop");

      expect(coll.db).to.be.an.instanceOf(MyAdapter);
    });

    it("should make the collection's remoteTransformers default to []", () => {
      const db = new Kinto();
      const coll = db.collection("plop");

      expect(coll.remoteTransformers).to.deep.equal([]);
    });

    it("should set collection's remoteTransformers", () => {
      const MyRemoteTransformer = class extends RemoteTransformer {};
      const db = new Kinto();
      const options = {
        remoteTransformers: [ new MyRemoteTransformer() ]
      };
      const coll = db.collection("plop", options);

      expect(coll.remoteTransformers).to.deep.equal(options.remoteTransformers);
    });
  });
});
