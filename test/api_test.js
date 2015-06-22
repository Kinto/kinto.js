"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import Api, { cleanRecord } from "../src/api";
import { quote } from "../src/utils";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const root = typeof window === "object" ? window : global;
const FAKE_SERVER_URL = "http://fake-server/v0"

describe("Api", () => {
  var sandbox, api;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    api = new Api(FAKE_SERVER_URL);
  });

  afterEach(() => {
    sandbox.restore();
  });

  function fakeServerResponse(status, json, headers={}) {
    return Promise.resolve({
      status: status,
      headers: {
        get(name) {
          return headers[name];
        }
      },
      json() {
        return json;
      }
    });
  }

  describe("#constructor", () => {
    it("should check that `remote` is a string", () => {
      expect(() => new Api(42))
        .to.Throw(Error, /Invalid remote URL/);
    });

    it("should validate `remote` arg value", () => {
      expect(() => new Api("http://nope"))
        .to.Throw(Error, /The remote URL must contain the version/);
    });

    it("should assign version value", () => {
      expect(new Api("http://test/v42").version).eql("v42");
    });
  });

  describe("#endpoints", () => {
    describe("full URL", () => {
      var endpoints;

      beforeEach(() => endpoints = api.endpoints({fullUrl: true}))

      it("should provide root endpoint", () => {
        expect(endpoints.root()).eql(FAKE_SERVER_URL);
      });

      it("should provide batch endpoint", () => {
        expect(endpoints.batch())
          .eql("http://fake-server/v0/batch");
      });

      it("should provide collection endpoint", () => {
        expect(endpoints.collection("toto"))
          .eql("http://fake-server/v0/collections/toto/records");
      });

      it("should provide record endpoint", () => {
        expect(endpoints.record("toto", 42))
          .eql("http://fake-server/v0/collections/toto/records/42");
      });
    });

    describe("absolute URL", () => {
      var endpoints;

      beforeEach(() => endpoints = api.endpoints({fullUrl: false}))

      it("should provide root endpoint", () => {
        expect(endpoints.root()).eql("/v0");
      });

      it("should provide batch endpoint", () => {
        expect(endpoints.batch())
          .eql("/v0/batch");
      });

      it("should provide collection endpoint", () => {
        expect(endpoints.collection("toto"))
          .eql("/v0/collections/toto/records");
      });

      it("should provide record endpoint", () => {
        expect(endpoints.record("toto", 42))
          .eql("/v0/collections/toto/records/42");
      });
    });
  });

  describe("#fetchChangesSince", () => {
    it("should request server for latest changes", () => {
      sandbox.stub(root, "fetch").returns(Promise.resolve());

      api.fetchChangesSince("articles");

      sinon.assert.calledOnce(fetch);
    });

    it("should request server changes since last modified", () =>{
      sandbox.stub(root, "fetch").returns(Promise.resolve());

      api.fetchChangesSince("articles", 42);

      sinon.assert.calledOnce(fetch);
      sinon.assert.calledWithMatch(fetch, /\?_since=42/);
    });

    it("should attach an If-None-Match header if lastModified is provided", () =>{
      sandbox.stub(root, "fetch").returns(Promise.resolve());
      api.fetchChangesSince("articles", 42);

      sinon.assert.calledOnce(fetch);
      sinon.assert.calledWithMatch(fetch, /\?_since=42/, {
        headers: {"If-None-Match": quote(42)}
      });
    });

    it("should resolve with a result object", () => {
      sandbox.stub(root, "fetch").returns(
        fakeServerResponse(200, {items: []}, {"ETag": quote(41)}));

      return api.fetchChangesSince("articles", 42)
        .should.eventually.become({
          lastModified: 41,
          changes: []
        });
    });

    it("should merge provided headers with default ones", () => {
      sandbox.stub(root, "fetch").returns(Promise.resolve());

      api.fetchChangesSince("articles", 42, {headers: {Foo: "bar"}});

      sinon.assert.calledOnce(fetch);
      sinon.assert.calledWithMatch(fetch, /\?_since=42/, {
        headers: {
          "Foo": "bar",
          "Accept": "application/json",
          "Content-Type": "application/json",
        }
      });
    });

    it("should resolve with no changes if HTTP 304 is received", () => {
      sandbox.stub(root, "fetch").returns(fakeServerResponse(304, {}));

      return api.fetchChangesSince("articles", 42)
        .should.eventually.become({lastModified: 42, changes: []});
    });

    it("should reject on any HTTP status >= 400", () => {
      sandbox.stub(root, "fetch").returns(fakeServerResponse(401, {}));

      return api.fetchChangesSince("articles", 42)
        .should.eventually.be.rejectedWith(Error, /failed: HTTP 401/);
    });
  });

  describe("#batch", () => {
    const operations = [
      {id: 1, title: "foo", last_modified: 42},
      {id: 2, title: "bar"},
      {id: 3, title: "baz", _status: "deleted"},
    ];

    describe("server request", () => {
      var requestBody;

      describe("empty changes", () => {
        it("should not perform request on empty operation list", () => {
          sandbox.stub(root, "fetch").returns(Promise.resolve({status: 200}));

          api.batch("articles", []);

          sinon.assert.notCalled(fetch);
        });
      });

      describe("non-empty changes", () => {
        beforeEach(() => {
          sandbox.stub(root, "fetch").returns(Promise.resolve({status: 200}));
          api.batch("articles", operations, {Foo: "Bar"});
          requestBody = JSON.parse(fetch.getCall(0).args[1].body);
        });

        it("should call the batch endpoint", () => {
          sinon.assert.calledWithMatch(fetch, "/v0/batch");
        });

        it("should define batch default headers", () => {
          expect(requestBody.defaults.headers).eql({Foo: "Bar"});
        });

        it("should batch the expected number of requests", () => {
          expect(requestBody.requests.length).eql(3);
        });

        it("should map create & update requests", () => {
          expect(requestBody.requests[0]).eql({
            body: {
              id: 1,
              title: "foo",
            },
            headers: {"If-Match": quote(42)},
            method: "PUT",
            path: "/v0/collections/articles/records/1",
          });
        });

        it("should map batch delete requests for non-synced records", () => {
          expect(requestBody.requests[2]).eql({
            headers: {},
            method: "DELETE",
            path: "/v0/collections/articles/records/3",
          });
        });

        it("should map batch update requests for synced records", () => {
          expect(requestBody.requests[0]).eql({
            path: "/v0/collections/articles/records/1",
            method: "PUT",
            headers: {
              "If-Match": quote(42)
            },
            body: {
              id: 1,
              title: "foo"
            }
          });
        });

        it("should map create requests for non-synced records", () => {
          expect(requestBody.requests[1]).eql({
            path: "/v0/collections/articles/records/2",
            method: "PUT",
            headers: {
              "If-None-Match": '*'
            },
            body: {
              id: 2,
              title: "bar"
            }
          });
        });
      });

      describe("safe mode", () => {
        var requests;

        beforeEach(() => {
          sandbox.stub(root, "fetch").returns(Promise.resolve({status: 200}));
          api.batch("articles", operations);
          requests = JSON.parse(fetch.getCall(0).args[1].body).requests;
        });

        it("should send If-Match headers", () => {
          expect(requests[0].headers).eql({"If-Match": quote(42)});
        });
      });
    });

    describe("server response", () => {
      describe("success", () => {
        const published = [{ id: 1, title: "art1" }, { id: 2, title: "art2" }];

        it("should reject on HTTP 400", () => {
          sandbox.stub(root, "fetch").returns(fakeServerResponse(400, {
            error: true,
            errno: 117,
            message: "http 400"
          }));

          return api.batch("articles", published)
            .should.eventually.be.rejectedWith(Error, /BATCH request failed: http 400/);
        });

        it("should reject on HTTP error status code", () => {
          sandbox.stub(root, "fetch").returns(fakeServerResponse(500, {
            error: true,
            message: "http 500"
          }));

          return api.batch("articles", published)
            .should.eventually.be.rejectedWith(Error, /BATCH request failed: http 500/);
        });

        it("should expose succesfully published results", () => {
          sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {
            responses: [
              { status: 201,
                path: "/v0/articles",
                body: published[0]},
              { status: 201,
                path: "/v0/articles",
                body: published[1]},
            ]
          }));

          return api.batch("articles", published)
            .should.eventually.become({
              conflicts: [],
              errors:    [],
              skipped:   [],
              published: published
            });
        });

        it("should resolve with skipped missing records", () => {
          sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {
            responses: [
              { status: 404,
                path: "/v0/articles/1",
                body: { 404: true }},
            ]
          }));

          return api.batch("articles", published)
            .should.eventually.become({
              conflicts: [],
              skipped:   [{ 404: true }],
              errors:    [],
              published: []
            });
        });

        it("should resolve with encountered HTTP errors", () => {
          sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {
            responses: [
              { status: 500,
                path: "/v0/articles/1",
                body: { 500: true }},
            ]
          }));

          return api.batch("articles", published)
            .should.eventually.become({
              conflicts: [],
              skipped:   [],
              errors:    [
                {
                  path: "/v0/articles/1",
                  error: {
                    500: true
                  }
                }
              ],
              published: []
            });
        });

        it("should expose encountered conflicts", () => {
          sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {
            responses: [
              { status: 412,
                path: "/v0/articles/1",
                body: { invalid: true }},
            ]
          }));

          return api.batch("articles", published)
            .should.eventually.become({
              conflicts: [{
                type: "outgoing",
                data: { invalid: true },
              }],
              skipped:   [],
              errors:    [],
              published: [],
            });
        });
      });
    });
  });

  describe("Helpers", () => {
    describe("#cleanRecord", () => {
      it("should clean record data", () => {
        expect(cleanRecord({title: "foo", _status: "foo"}))
          .eql({title: "foo"});
      });
    });
  });
});
