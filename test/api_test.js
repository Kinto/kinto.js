"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import { EventEmitter } from "events";
import { quote } from "../src/utils";
import { fakeServerResponse } from "./test_utils.js";
import Api, { SUPPORTED_PROTOCOL_VERSION as SPV, cleanRecord } from "../src/api";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const root = typeof window === "object" ? window : global;
const FAKE_SERVER_URL = "http://fake-server/v1";

/** @test {Api} */
describe("Api", () => {
  let sandbox, api, events;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    events = new EventEmitter();
    api = new Api(FAKE_SERVER_URL, events);
  });

  afterEach(() => {
    sandbox.restore();
  });

  /** @test {Api#constructor} */
  describe("#constructor", () => {
    it("should check that `remote` is a string", () => {
      expect(() => new Api(42, events))
        .to.Throw(Error, /Invalid remote URL/);
    });

    it("should validate `remote` arg value", () => {
      expect(() => new Api("http://nope", events))
        .to.Throw(Error, /The remote URL must contain the version/);
    });

    it("should strip any trailing slash", () => {
      expect(new Api(`http://test/${SPV}/`, events).remote).eql(`http://test/${SPV}`);
    });

    it("should expose a passed events instance option", () => {
      expect(new Api(`http://test/${SPV}`, events).events).to.eql(events);
    });

    it("should propagate its events property to child dependencies", () => {
      const api = new Api(`http://test/${SPV}`, events);
      expect(api.http.events).eql(api.events);
    });

    it("should assign version value", () => {
      expect(new Api(`http://test/${SPV}`, events).version).eql(SPV);
      expect(new Api(`http://test/${SPV}/`, events).version).eql(SPV);
    });

    it("should accept a headers option", () => {
      expect(new Api(`http://test/${SPV}`, events, {headers: {Foo: "Bar"}}).optionHeaders)
        .eql({Foo: "Bar"});
    });

    it("should validate protocol version", () => {
      expect(() => new Api(`http://test/v999`, events))
        .to.Throw(Error, /^Unsupported protocol version/);
    });

    it("should propagate the requestMode option to the child HTTP instance", () => {
      const requestMode = "no-cors";
      expect(new Api(`http://test/${SPV}`, events, {requestMode}).http.requestMode)
        .eql(requestMode);
    });

    it("should complain if an events handler is not provided", () => {
      expect(() => {
        new Api(`http://test/${SPV}`);
      }).to.Throw(Error,/No events handler provided/);
    });
  });

  describe("get backoff()", () => {
    it("should provide the remaining backoff time in ms if any", () => {
      // Make Date#getTime always returning 1000000, for predictability
      sandbox.stub(Date.prototype, "getTime").returns(1000 * 1000);
      sandbox.stub(root, "fetch").returns(
        fakeServerResponse(200, {}, {Backoff: "1000"}));

      return api.fetchChangesSince()
        .then(_ => expect(api.backoff).eql(1000000));
    });

    it("should provide no remaining backoff time when none is set", () => {
      sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {}, {}));

      return api.fetchChangesSince()
        .then(_ => expect(api.backoff).eql(0));
    });
  });

  /** @test {Api#endpoints} */
  describe("#endpoints", () => {
    describe("full URL", () => {
      let endpoints;

      beforeEach(() => endpoints = api.endpoints({fullUrl: true}));

      it("should provide root endpoint", () => {
        expect(endpoints.root()).eql(`${FAKE_SERVER_URL}/`);
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
      let endpoints;

      beforeEach(() => endpoints = api.endpoints({fullUrl: false}));

      it("should provide root endpoint", () => {
        expect(endpoints.root()).eql(`/${SPV}/`);
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

  /** @test {Api#fetchServerSettings} */
  describe("#fetchServerSettings", () => {
    it("should retrieve server settings on first request made", () => {
      sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {
        settings: {"cliquet.batch_max_requests": 25}
      }));

      return api.fetchServerSettings()
        .should.eventually.become({"cliquet.batch_max_requests": 25});
    });

    it("should store server settings into the serverSettings property", () => {
      api.serverSettings = {a: 1};
      sandbox.stub(root, "fetch");

      api.fetchServerSettings();
    });

    it("should not fetch server settings if they're cached already", () => {
      api.serverSettings = {a: 1};
      sandbox.stub(root, "fetch");

      api.fetchServerSettings();
      sinon.assert.notCalled(fetch);
    });
  });

  /** @test {Api#fetchChangesSince} */
  describe("#fetchChangesSince", () => {
    it("should fetch server settings", () => {
      sandbox.stub(api, "fetchServerSettings")
        .returns(Promise.resolve({foo: 42}));

      api.fetchChangesSince("blog", "articles");

      sinon.assert.calledOnce(api.fetchServerSettings);
    });

    describe("Request", () => {
      beforeEach(() => {
        sandbox.stub(root, "fetch")
          // fetch server Settings
          .onFirstCall().returns(fakeServerResponse(200, {}, {}))
          // fetch latest changes
          .onSecondCall().returns(fakeServerResponse(200, {data: []}, {}));
      });

      it("should merge instance option headers", () => {
        api.optionHeaders = {Foo: "Bar"};
        return api.fetchChangesSince("blog", "articles", {lastModified: 42})
          .then(_ => expect(fetch.secondCall.args[1].headers.Foo).eql("Bar"));
      });

      it("should request server changes since last modified", () =>{
        return api.fetchChangesSince("blog", "articles", {lastModified: 42})
          .then(_ => expect(fetch.secondCall.args[0]).to.match(/\?_since=42/));
      });

      it("should attach an If-None-Match header if lastModified is provided", () =>{
        return api.fetchChangesSince("blog", "articles", {lastModified: 42})
          .then(_ => expect(fetch.secondCall.args[1].headers["If-None-Match"]).eql(quote(42)));
      });

      it("should merge provided headers with default ones", () => {
        const options = {lastModified: 42, headers: {Foo: "bar"}};
        return api.fetchChangesSince("blog", "articles", options)
          .then(_ => expect(fetch.secondCall.args[1].headers).eql({
            "Foo": "bar",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "If-None-Match": quote(42),
          }));
      });
    });

    describe("Response", () => {
      it("should resolve with a result object", () => {
        sandbox.stub(root, "fetch").returns(
          fakeServerResponse(200, {data: []}, {"ETag": quote(41)}));

        return api.fetchChangesSince("blog", "articles", { lastModified: 42 })
          .should.eventually.become({
            lastModified: 41,
            changes: []
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
          .should.eventually.be.rejectedWith(Error, /HTTP 401; Invalid Authorization Token/);
      });

      it("should expose json response body to err object on rejection", () => {
        const response = {errno: 105, message: "Dude."};

        sandbox.stub(root, "fetch").returns(fakeServerResponse(401, response));

        return api.fetchChangesSince("blog", "articles")
          .catch(err => err.data)
          .should.eventually.become(response);
      });

      it("should reject on server flushed", () => {
        sandbox.stub(root, "fetch").returns(
          fakeServerResponse(200, {data: []}, {ETag: quote(43)}));

        return api.fetchChangesSince("blog", "articles", {lastModified: 42})
          .should.be.rejectedWith(Error, /Server has been flushed/);
      });
    });
  });

  /** @test {Api#batch} */
  describe("#batch", () => {
    const operations = [
      {id: 1, title: "foo", last_modified: 42},
      {id: 2, title: "bar"},
      {id: 3, title: "baz", _status: "deleted"},
    ];

    beforeEach(() => {
      sandbox.stub(api, "fetchServerSettings").returns(Promise.resolve({
        "cliquet.batch_max_requests": 3
      }));
    });

    describe("server request", () => {
      let requestBody, requestHeaders;

      beforeEach(() => {
        sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {
          responses: []
        }));
      });

      it("should ensure server settings are fetched", () => {
        return api.batch("blog", "articles", [{}])
          .then(_ => sinon.assert.calledOnce(api.fetchServerSettings));
      });

      describe("empty changes", () => {
        it("should not perform request on empty operation list", () => {
          api.batch("blog", "articles", []);

          sinon.assert.notCalled(fetch);
        });
      });

      describe("non-empty changes", () => {
        beforeEach(() => {
          api.optionHeaders = {Authorization: "Basic plop"};
          return api.batch("blog", "articles", operations, {headers: {Foo: "Bar"}})
            .then(_ => {
              const request = fetch.firstCall.args[1];
              requestHeaders = request.headers;
              requestBody = JSON.parse(request.body);
            });
        });

        it("should call the batch endpoint", () => {
          sinon.assert.calledWithMatch(fetch, `/${SPV}/batch`);
        });

        it("should define main batch request default headers", () => {
          expect(requestBody.defaults.headers).eql({
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
              "If-None-Match": "*"
            },
            body: {
              data: { id: 2, title: "bar" },
            }
          });
        });
      });

      describe("safe mode", () => {
        let requests;

        beforeEach(() => {
          return api.batch("blog", "articles", operations)
            .then(_ => {
              requests = JSON.parse(fetch.getCall(0).args[1].body).requests;
            });
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
            .should.eventually.be.rejectedWith(Error, /HTTP 400/);
        });

        it("should reject on HTTP error status code", () => {
          sandbox.stub(root, "fetch").returns(fakeServerResponse(500, {
            error: true,
            message: "http 500"
          }));

          return api.batch("blog", "articles", published)
            .should.eventually.be.rejectedWith(Error, /HTTP 500/);
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
          const missingRemotely = published[0];
          sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {
            responses: [
              { status: 404,
                path: `/${SPV}/buckets/blog/collections/articles/records/1`,
                body: missingRemotely},
            ]
          }));

          return api.batch("blog", "articles", published)
            .should.eventually.become({
              conflicts: [],
              skipped:   [missingRemotely],
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
                  error: { 500: true },
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
                body: {
                  details: {
                    existing: {title: "foo"}
                  }
                }},
            ]
          }));

          return api.batch("blog", "articles", published)
            .should.eventually.become({
              conflicts: [{
                type: "outgoing",
                local: published[0],
                remote: {title: "foo"}
              }],
              skipped:   [],
              errors:    [],
              published: [],
            });
        });
      });
    });

    describe("Chunked requests", () => {
      // 4 operations, one more than the test limit which is 3
      const moreOperations = [
        {id: 1, title: "foo"},
        {id: 2, title: "bar"},
        {id: 3, title: "baz"},
        {id: 4, title: "qux"},
      ];

      it("should chunk batch requests", () => {
        sandbox.stub(root, "fetch")
          .onFirstCall().returns(fakeServerResponse(200, {
            responses: [
              {status: 200, body: {data: 1}},
              {status: 200, body: {data: 2}},
              {status: 200, body: {data: 3}},
            ]
          }))
          .onSecondCall().returns(fakeServerResponse(200, {
            responses: [
              {status: 200, body: {data: 4}},
            ]
          }));
        return api.batch("blog", "articles", moreOperations)
          .then(res => res.published)
          .should.become([1, 2, 3, 4]);
      });

      it("should not chunk batch requests if setting is falsy", () => {
        api.fetchServerSettings.returns(Promise.resolve({
          "cliquet.batch_max_requests": null
        }));
        sandbox.stub(root, "fetch").returns(fakeServerResponse(200, {
          responses: []
        }));
        return api.batch("blog", "articles", moreOperations)
          .then(_ => sinon.assert.calledOnce(fetch));
      });

      it("should map initial records to conflict objects", () => {
        sandbox.stub(root, "fetch")
          .onFirstCall().returns(fakeServerResponse(200, {
            responses: [
              {status: 412, body: {details: {existing: {id: 1}}}},
              {status: 412, body: {details: {existing: {id: 2}}}},
              {status: 412, body: {}},
            ]
          }))
          .onSecondCall().returns(fakeServerResponse(200, {
            responses: [
              {status: 412, body: {details: {existing: {id: 4}}}},
            ]
          }));
        return api.batch("blog", "articles", moreOperations)
          .then(res => res.conflicts)
          .should.become([{
            type: "outgoing",
            local:  {id: 1, title: "foo"},
            remote: {id: 1}
          }, {
            type: "outgoing",
            local:  {id: 2, title: "bar"},
            remote: {id: 2}
          }, {
            type: "outgoing",
            local:  {id: 3, title: "baz"},
            remote: null
          }, {
            type: "outgoing",
            local:  {id: 4, title: "qux"},
            remote: {id: 4}
          }]);
      });

      it("should chunk batch requests concurrently", () => {
        sandbox.stub(root, "fetch")
          .onFirstCall().returns(new Promise(resolve => {
            setTimeout(() => {
              resolve(fakeServerResponse(200, {
                responses: [
                  {status: 200, body: {data: 1}},
                  {status: 200, body: {data: 2}},
                  {status: 200, body: {data: 3}},
                ]
              }));
            }, 100);
          }))
          .onSecondCall().returns(new Promise(resolve => {
            setTimeout(() => {
              resolve(fakeServerResponse(200, {
                responses: [
                  {status: 200, body: {data: 4}},
                ]
              }));
            }, 5);
          }));
        return api.batch("blog", "articles", moreOperations)
          .then(res => res.published)
          .should.become([1, 2, 3, 4]);
      });
    });
  });

  describe("Helpers", () => {
    /** @test {cleanRecord} */
    describe("#cleanRecord", () => {
      it("should clean record data", () => {
        expect(cleanRecord({title: "foo", _status: "foo"}))
          .eql({title: "foo"});
      });
    });
  });
});
