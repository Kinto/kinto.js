"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import Api, { SUPPORTED_PROTOCOL_VERSION as SPV, cleanRecord } from "../src/api";
import { quote } from "../src/utils";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const root = typeof window === "object" ? window : global;
const FAKE_SERVER_URL = "http://fake-server/v1"

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
      expect(new Api(`http://test/${SPV}`).version).eql(SPV);
    });

    it("should accept a headers option", () => {
      expect(new Api(`http://test/${SPV}`, {headers: {Foo: "Bar"}}).optionHeaders)
        .eql({Foo: "Bar"});
    });

    it("should validate protocol version", function() {
      expect(() =>new Api(`http://test/v999`))
        .to.Throw(Error, /^Unsupported protocol version/);
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
          .eql(`http://fake-server/${SPV}/batch`);
      });

      it("should provide bucket endpoint", () => {
        expect(endpoints.bucket("foo"))
          .eql(`http://fake-server/${SPV}/buckets/foo`);
      });

      it("should provide collection endpoint", () => {
        expect(endpoints.collection("foo", "bar"))
          .eql(`http://fake-server/${SPV}/buckets/foo/collections/bar`);
      });

      it("should provide records endpoint", () => {
        expect(endpoints.records("foo", "bar"))
          .eql(`http://fake-server/${SPV}/buckets/foo/collections/bar/records`);
      });

      it("should provide record endpoint", () => {
        expect(endpoints.record("foo", "bar", 42))
          .eql(`http://fake-server/${SPV}/buckets/foo/collections/bar/records/42`);
      });
    });

    describe("absolute URL", () => {
      var endpoints;

      beforeEach(() => endpoints = api.endpoints({fullUrl: false}))

      it("should provide root endpoint", () => {
        expect(endpoints.root()).eql(`/${SPV}`);
      });

      it("should provide batch endpoint", () => {
        expect(endpoints.batch())
          .eql(`/${SPV}/batch`);
      });

      it("should provide bucket endpoint", () => {
        expect(endpoints.bucket("foo"))
          .eql(`/${SPV}/buckets/foo`);
      });

      it("should provide collection endpoint", () => {
        expect(endpoints.collection("foo", "bar"))
          .eql(`/${SPV}/buckets/foo/collections/bar`);
      });

      it("should provide records endpoint", () => {
        expect(endpoints.records("foo", "bar", 42))
          .eql(`/${SPV}/buckets/foo/collections/bar/records`);
      });

      it("should provide record endpoint", () => {
        expect(endpoints.record("foo", "bar", 42))
          .eql(`/${SPV}/buckets/foo/collections/bar/records/42`);
      });
    });
  });

  describe("#fetchChangesSince", () => {
    it("should request server for latest changes", () => {
      sandbox.stub(root, "fetch").returns(
        fakeServerResponse(200, { data: [] }, { }));

      api.fetchChangesSince("blog", "articles");

      sinon.assert.calledOnce(fetch);
    });

    it("should merge instance option headers", () => {
      sandbox.stub(root, "fetch").returns(
        fakeServerResponse(200, { data: [] }, { }));
      api.optionHeaders = {Foo: "Bar"};

      api.fetchChangesSince("blog", "articles");

      sinon.assert.calledOnce(fetch);
      sinon.assert.calledWithMatch(fetch, "/records", {
        headers: {Foo: "Bar"}
      });
    });

    it("should request server changes since last modified", () =>{
      sandbox.stub(root, "fetch").returns(
        fakeServerResponse(200, { data: [] }, { }));

      api.fetchChangesSince("blog", "articles", {lastModified: 42});

      sinon.assert.calledOnce(fetch);
      sinon.assert.calledWithMatch(fetch, /\?_since=42/);
    });

    it("should attach an If-None-Match header if lastModified is provided", () =>{
      sandbox.stub(root, "fetch").returns(
        fakeServerResponse(200, { data: [] }, { }));
      api.fetchChangesSince("blog", "articles", {lastModified: 42});

      sinon.assert.calledOnce(fetch);
      sinon.assert.calledWithMatch(fetch, /\?_since=42/, {
        headers: { "If-None-Match": quote(42) }
      });
    });

    it("should resolve with a result object", () => {
      sandbox.stub(root, "fetch").returns(
        fakeServerResponse(200, { data: [] }, { "ETag": quote(41) }));

      return api.fetchChangesSince("blog", "articles", { lastModified: 42 })
        .should.eventually.become({
          lastModified: 41,
          changes: []
        });
    });

    it("should merge provided headers with default ones", () => {
      sandbox.stub(root, "fetch").returns(
        fakeServerResponse(200, { data: [] }, { }));

      const options = {lastModified: 42, headers: {Foo: "bar"}};
      api.fetchChangesSince("blog", "articles", options);

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

      return api.fetchChangesSince("blog", "articles", {lastModified: 42})
        .should.eventually.become({lastModified: 42, changes: []});
    });

    it("should reject on any HTTP status >= 400", () => {
      sandbox.stub(root, "fetch").returns(fakeServerResponse(401, {}));

      return api.fetchChangesSince("blog", "articles")
        .should.eventually.be.rejectedWith(Error, /HTTP 401/);
    });

    it("should reject with detailed error message", () => {
      sandbox.stub(root, "fetch").returns(fakeServerResponse(401, {
        errno: 105
      }));

      return api.fetchChangesSince("blog", "articles")
        .should.eventually.be.rejectedWith(Error, /HTTP 401 Invalid Authorization Token/);
    });

    it("should reject with fallback error message", () => {
      sandbox.stub(root, "fetch").returns(fakeServerResponse(401, {}));

      return api.fetchChangesSince("blog", "articles")
        .should.eventually.be.rejectedWith(Error, /HTTP 401$/);
    });

    it("should expose json response body to err object on rejection", () => {
      const response = {errno: 105, message: "Dude."};

      sandbox.stub(root, "fetch").returns(fakeServerResponse(401, response));

      return api.fetchChangesSince("blog", "articles")
        .catch(err => err.data)
        .should.eventually.become(response);
    });

    it("should reject on on invalid json response body", () => {
      sandbox.stub(root, "fetch").returns(Promise.resolve({
        status: 500,
        json() {
          return Promise.reject("JSON Error");
        }
      }));

      return api.fetchChangesSince("blog", "articles")
        .should.eventually.be.rejectedWith(Error, /HTTP 500; JSON Error/);
    });
  });

  describe("#fetchServerSettings", () => {
    it("should retrieve server settings on first request made", () => {
      sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {
        settings: {"cliquet.batch_max_requests": 25}
      }));

      return api.fetchServerSettings()
        .should.eventually.become({"cliquet.batch_max_requests": 25});
    });

    it("should reject on fetch errors", function() {
      sandbox.stub(root, "fetch").returns(Promise.resolve({
        status: 500,
        json() {
          return Promise.reject("weird error");
        }
      }));

      return api.fetchServerSettings()
        .should.be.rejectedWith(Error, /HTTP 500; weird error/);
    });

    it("should store server settings into the serverSettings property", () => {
      api.serverSettings = {a: 1};
      sandbox.stub(root, "fetch");

      api.fetchServerSettings();
    });

    it("should not fetch server settings if they're cached already", () => {
      api.serverSettings = {a: 1};
      sandbox.stub(root, "fetch");

      api.fetchServerSettings()
      sinon.assert.notCalled(fetch);
    });
  });

  describe("#batch", () => {
    const operations = [
      {id: 1, title: "foo", last_modified: 42},
      {id: 2, title: "bar"},
      {id: 3, title: "baz", _status: "deleted"},
    ];

    describe("server request", () => {
      var requestBody, requestHeaders;

      describe("empty changes", () => {
        it("should not perform request on empty operation list", () => {
          sandbox.stub(root, "fetch").returns(Promise.resolve({status: 200}));

          api.batch("blog", "articles", []);

          sinon.assert.notCalled(fetch);
        });
      });

      describe("non-empty changes", () => {
        beforeEach(() => {
          sandbox.stub(root, "fetch").returns(Promise.resolve({status: 200}));
          api.optionHeaders = {Authorization: "Basic plop"};
          api.batch("blog", "articles", operations, {headers: {Foo: "Bar"}});

          const request = fetch.getCall(0).args[1];
          requestHeaders = request.headers;
          requestBody = JSON.parse(request.body);
        });

        it("should call the batch endpoint", () => {
          sinon.assert.calledWithMatch(fetch, `/${SPV}/batch`);
        });

        it("should define batch default headers", () => {
          expect(requestBody.defaults.headers).eql({
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": "Basic plop",
            "Foo": "Bar",
          });
        });

        it("should attach all batch request headers", () => {
          expect(requestHeaders.Authorization).eql("Basic plop");
        });

        it("should batch the expected number of requests", () => {
          expect(requestBody.requests.length).eql(3);
        });

        it("should map create & update requests", () => {
          expect(requestBody.requests[0]).eql({
            body: {
              data: { id: 1, title: "foo" },
            },
            headers: { "If-Match": quote(42) },
            method: "PUT",
            path: `/${SPV}/buckets/blog/collections/articles/records/1`,
          });
        });

        it("should map batch delete requests for non-synced records", () => {
          expect(requestBody.requests[2]).eql({
            headers: {},
            method: "DELETE",
            path: `/${SPV}/buckets/blog/collections/articles/records/3`,
          });
        });

        it("should map batch update requests for synced records", () => {
          expect(requestBody.requests[0]).eql({
            path: `/${SPV}/buckets/blog/collections/articles/records/1`,
            method: "PUT",
            headers: { "If-Match": quote(42) },
            body: {
              data: { id: 1, title: "foo" },
            }
          });
        });

        it("should map create requests for non-synced records", () => {
          expect(requestBody.requests[1]).eql({
            path: `/${SPV}/buckets/blog/collections/articles/records/2`,
            method: "PUT",
            headers: {
              "If-None-Match": '*'
            },
            body: {
              data: { id: 2, title: "bar" },
            }
          });
        });
      });

      describe("safe mode", () => {
        var requests;

        beforeEach(() => {
          sandbox.stub(root, "fetch").returns(Promise.resolve({status: 200}));
          api.batch("blog", "articles", operations);
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

          return api.batch("blog", "articles", published)
            .should.eventually.be.rejectedWith(Error, /BATCH request failed: HTTP 400/);
        });

        it("should reject on HTTP error status code", () => {
          sandbox.stub(root, "fetch").returns(fakeServerResponse(500, {
            error: true,
            message: "http 500"
          }));

          return api.batch("blog", "articles", published)
            .should.eventually.be.rejectedWith(Error, /BATCH request failed: HTTP 500/);
        });

        it("should expose succesfully published results", () => {
          sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {
            responses: [
              { status: 201,
                path: `/${SPV}/buckets/blog/collections/articles/records`,
                body: { data: published[0]}},
              { status: 201,
                path: `/${SPV}/buckets/blog/collections/articles/records`,
                body: { data: published[1]}},
            ]
          }));

          return api.batch("blog", "articles", published)
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
                path: `/${SPV}/buckets/blog/collections/articles/records/1`,
                body: { 404: true }},
            ]
          }));

          return api.batch("blog", "articles", published)
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
                path: `/${SPV}/buckets/blog/collections/articles/records/1`,
                body: { 500: true }},
            ]
          }));

          return api.batch("blog", "articles", published)
            .should.eventually.become({
              conflicts: [],
              skipped:   [],
              errors:    [
                {
                  path: `/${SPV}/buckets/blog/collections/articles/records/1`,
                  sent: published[0],
                  error: { 500: true }
                }
              ],
              published: []
            });
        });

        it("should expose encountered conflicts", () => {
          sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {
            responses: [
              { status: 412,
                path: `/${SPV}/buckets/blog/collections/articles/records/1`,
                body: { invalid: true }},
            ]
          }));

          return api.batch("blog", "articles", published)
            .should.eventually.become({
              conflicts: [{
                type: "outgoing",
                local: published[0],
                remote: { invalid: true }
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
