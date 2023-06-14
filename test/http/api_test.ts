import sinon from "sinon";
import { EventEmitter } from "events";
import { fakeServerResponse, Stub, expectAsyncError } from "../test_utils";
import KintoClient from "../../src/http";
import KintoClientBase, {
  SUPPORTED_PROTOCOL_VERSION as SPV,
  PaginationResult,
} from "../../src/http/base";
import Bucket from "../../src/http/bucket";
import { HelloResponse, OperationResponse } from "../../src/types";
import { KintoBatchResponse, AggregateResponse } from "../../src/http/batch";

const { expect } = intern.getPlugin("chai");
intern.getPlugin("chai").should();
const { describe, it, beforeEach, afterEach } =
  intern.getPlugin("interface.bdd");

const FAKE_SERVER_URL = "http://fake-server/v1";

/** @test {KintoClient} */
describe("KintoClient", () => {
  let sandbox: sinon.SinonSandbox, api: KintoClient, events: EventEmitter;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    events = new EventEmitter();
    api = new KintoClient(FAKE_SERVER_URL, { events });
  });

  afterEach(() => {
    sandbox.restore();
  });

  /** @test {KintoClient#constructor} */
  describe("#constructor", () => {
    const sampleRemote = `http://test/${SPV}`;

    it("should check that `remote` is a string", () => {
      expect(
        () =>
          new KintoClient(42 as any, {
            events,
          })
      ).to.Throw(Error, /Invalid remote URL/);
    });

    it("should validate `remote` arg value", () => {
      expect(() => new KintoClient("http://nope")).to.Throw(
        Error,
        /The remote URL must contain the version/
      );
    });

    it("should strip any trailing slash", () => {
      expect(new KintoClient(sampleRemote).remote).eql(sampleRemote);
    });

    it("should expose a passed events instance option", () => {
      expect(new KintoClient(sampleRemote, { events }).events).to.eql(events);
    });

    it("should propagate its events property to child dependencies", () => {
      const api = new KintoClient(sampleRemote, { events });
      expect(api.http.events).eql(api.events);
    });

    it("should assign version value", () => {
      expect(new KintoClient(sampleRemote).version).eql(SPV);
      expect(new KintoClient(sampleRemote).version).eql(SPV);
    });

    it("should accept a headers option", () => {
      expect(
        new KintoClient(sampleRemote, {
          headers: { Foo: "Bar" },
        })._headers
      ).eql({ Foo: "Bar" });
    });

    it("should validate protocol version", () => {
      expect(() => new KintoClient("http://test/v999")).to.Throw(
        Error,
        /^Unsupported protocol version/
      );
    });

    it("should propagate the requestMode option to the child HTTP instance", () => {
      const requestMode = "no-cors";
      expect(
        new KintoClient(sampleRemote, {
          requestMode,
        }).http.requestMode
      ).eql(requestMode);
    });

    it("should keep the default timeout in the child HTTP instance", () => {
      expect(new KintoClient(sampleRemote).http.timeout).eql(null);
    });

    it("should propagate the timeout option to the child HTTP instance", () => {
      const timeout = 1000;
      expect(
        new KintoClient(sampleRemote, {
          timeout,
        }).http.timeout
      ).eql(timeout);
    });

    it("should not create an event emitter if none is provided", () => {
      expect(new KintoClient(sampleRemote).events).to.be.undefined;
    });

    it("should expose provided event emitter as a property", () => {
      const events = new EventEmitter();
      expect(new KintoClient(sampleRemote, { events }).events).eql(events);
    });

    it("should accept a safe option", () => {
      const api = new KintoClient(sampleRemote, { safe: true });
      expect(api._safe).eql(true);
    });

    it("should use fetchFunc option", async () => {
      let called = false;
      async function fetchFunc() {
        called = true;
        return fakeServerResponse(200, {}, {});
      }
      const api = new KintoClient(sampleRemote, { fetchFunc });

      await api.fetchServerInfo();

      expect(called).eql(true);
    });
  });

  /** @test {KintoClient#setHeaders} */
  describe("#setHeaders", () => {
    let client: KintoClient;

    beforeEach(() => {
      client = new KintoClient(FAKE_SERVER_URL, {
        headers: { Foo: "Bar", Authorization: "Biz" },
      });
    });

    it("should override constructor headers", () => {
      client.setHeaders({
        Authorization: "Baz",
      });
      expect(client._headers).eql({ Foo: "Bar", Authorization: "Baz" });
    });
  });

  /** @test {KintoClient#backoff} */
  describe("get backoff()", () => {
    it("should provide the remaining backoff time in ms if any", async () => {
      // Make Date#getTime always returning 1000000, for predictability
      sandbox.stub(Date.prototype, "getTime").returns(1000 * 1000);
      sandbox
        .stub(api.http as any, "fetchFunc")
        .returns(fakeServerResponse(200, {}, { Backoff: "1000" }));

      await api.listBuckets();
      return expect(api.backoff).eql(1000000);
    });

    it("should provide no remaining backoff time when none is set", async () => {
      sandbox
        .stub(api.http as any, "fetchFunc")
        .returns(fakeServerResponse(200, {}, {}));

      await api.listBuckets();
      return expect(api.backoff).eql(0);
    });
  });

  /** @test {KintoClient#bucket} */
  describe("#bucket()", () => {
    it("should return a Bucket instance", () => {
      expect(api.bucket("foo")).to.be.an.instanceOf(Bucket);
    });

    it("should propagate default req options to bucket instance", () => {
      const options = {
        safe: true,
        retry: 0,
        headers: { Foo: "Bar" },
        batch: false,
      };

      const bucket = api.bucket("foo", options);
      expect(bucket).property("_safe", options.safe);
      expect(bucket).property("_retry", options.retry);
      expect(bucket).property("_headers").eql(options.headers);
    });
  });

  /** @test {KintoClient#fetchServerInfo} */
  describe("#fetchServerInfo", () => {
    const fakeServerInfo: HelloResponse = {
      project_name: "",
      project_version: "",
      http_api_version: "",
      project_docs: "",
      url: "",
      settings: { readonly: false, batch_max_requests: 25 },
      capabilities: {},
    };

    it("should retrieve server settings on first request made", async () => {
      sandbox
        .stub(api.http as any, "fetchFunc")
        .returns(fakeServerResponse(200, fakeServerInfo));

      (await api.fetchServerInfo()).should.deep.equal(fakeServerInfo);
    });

    it("should store server settings into the serverSettings property", async () => {
      // api.serverSettings = { a: 1 };
      sandbox
        .stub(api.http as any, "fetchFunc")
        .returns(fakeServerResponse(200, fakeServerInfo));

      await api.fetchServerInfo();
      expect(api).property("serverInfo").deep.equal(fakeServerInfo);
    });

    it("should not fetch server settings if they're cached already", () => {
      api.serverInfo = fakeServerInfo;
      const fetchStub = sandbox.stub(api.http as any, "fetchFunc");

      api.fetchServerInfo();
      sinon.assert.notCalled(fetchStub);
    });

    it("should refresh server info if headers were changed", () => {
      api.serverInfo = fakeServerInfo;
      api.setHeaders({
        Authorization: "Baz",
      });
      expect(api.serverInfo).eql(null);
    });
  });

  /** @test {KintoClient#fetchServerSettings} */
  describe("#fetchServerSettings()", () => {
    const fakeServerInfo = { settings: { fake: true } };

    it("should retrieve server settings", async () => {
      sandbox
        .stub(api.http as any, "fetchFunc")
        .returns(fakeServerResponse(200, fakeServerInfo));

      (await api.fetchServerSettings()).should.have.property("fake").eql(true);
    });
  });

  /** @test {KintoClient#fetchServerCapabilities} */
  describe("#fetchServerCapabilities()", () => {
    const fakeServerInfo = { capabilities: { fake: true } };

    it("should retrieve server capabilities", async () => {
      sandbox
        .stub(api.http as any, "fetchFunc")
        .returns(fakeServerResponse(200, fakeServerInfo));

      (await api.fetchServerCapabilities()).should.have
        .property("fake")
        .eql(true);
    });
  });

  /** @test {KintoClient#fetchUser} */
  describe("#fetchUser()", () => {
    const fakeServerInfo = { user: { fake: true } };

    it("should retrieve user information", async () => {
      sandbox
        .stub(api.http as any, "fetchFunc")
        .returns(fakeServerResponse(200, fakeServerInfo));

      (await api.fetchUser())!.should.have.property("fake").eql(true);
    });
  });

  /** @test {KintoClient#fetchHTTPApiVersion} */
  describe("#fetchHTTPApiVersion()", () => {
    const fakeServerInfo = { http_api_version: { fake: true } };

    it("should retrieve current API version", async () => {
      sandbox
        .stub(api.http as any, "fetchFunc")
        .returns(fakeServerResponse(200, fakeServerInfo));

      (await api.fetchHTTPApiVersion()).should.have.property("fake").eql(true);
    });
  });

  /** @test {KintoClient#batch} */
  describe("#batch", () => {
    beforeEach(() => {
      const fetchServerSettings = sandbox.stub().returns(
        Promise.resolve({
          batch_max_requests: 3,
        })
      );
      sandbox.stub(api, "fetchServerSettings").get(() => fetchServerSettings);
    });

    function executeBatch(fixtures: { [key: string]: any }[], options = {}) {
      return api
        .bucket("default")
        .collection("blog")
        .batch((batch) => {
          for (const article of fixtures) {
            batch.createRecord(article);
          }
        }, options);
    }

    describe("Batch client setup", () => {
      it("should skip registering HTTP events", async () => {
        const on = sandbox.spy();
        const api = new KintoClient(FAKE_SERVER_URL, { events: { on } as any });

        await api.batch(() => {});
        return sinon.assert.calledOnce(on);
      });
    });

    describe("server request", () => {
      let requestBody: any, requestHeaders: any, fetch: sinon.SinonStub;

      beforeEach(() => {
        fetch = sandbox.stub(api.http as any, "fetchFunc");
        fetch.returns(fakeServerResponse(200, { responses: [] }));
      });

      it("should ensure server settings are fetched", async () => {
        await api.batch((batch: KintoClientBase) => batch.createBucket("blog"));
        return sinon.assert.called(api.fetchServerSettings as any);
      });

      describe("empty request list", () => {
        it("should not perform request on empty operation list", () => {
          // @ts-ignore
          api.batch((batch) => {});

          sinon.assert.notCalled(fetch);
        });
      });

      describe("non-empty request list", () => {
        const fixtures = [
          { title: "art1" },
          { title: "art2" },
          { title: "art3" },
        ];

        beforeEach(async () => {
          api._headers = { Authorization: "Basic plop" };
          await api
            .bucket("default")
            .collection("blog")
            .batch(
              (batch) => {
                for (const article of fixtures) {
                  batch.createRecord(article);
                }
              },
              { headers: { Foo: "Bar" } }
            );
          const request = fetch.firstCall.args[1];
          requestHeaders = request.headers;
          requestBody = JSON.parse(request.body);
        });

        it("should call the batch endpoint", () => {
          sinon.assert.calledWithMatch(fetch, `/${SPV}/batch`);
        });

        it("should define main batch request default headers", () => {
          expect(requestBody.defaults.headers).eql({
            Authorization: "Basic plop",
            Foo: "Bar",
          });
        });

        it("should attach all batch request headers", () => {
          expect(requestHeaders.Authorization).eql("Basic plop");
        });

        it("should batch the expected number of requests", () => {
          expect(requestBody.requests.length).eql(3);
        });
      });

      describe("Safe mode", () => {
        const fixtures = [{ title: "art1" }, { title: "art2" }];

        it("should forward the safe option to resulting requests", async () => {
          await api
            .bucket("default")
            .collection("blog")
            .batch(
              (batch) => {
                for (const article of fixtures) {
                  batch.createRecord(article);
                }
              },
              { safe: true }
            );
          const { requests } = JSON.parse(fetch.firstCall.args[1].body);
          expect(
            requests.map(
              (r: {
                headers: {
                  [key: string]: string;
                }[];
              }) => r.headers
            )
          ).eql([{ "If-None-Match": "*" }, { "If-None-Match": "*" }]);
        });
      });

      describe("Retry", (__test) => {
        const response = {
          status: 201,
          path: `/${SPV}/buckets/blog/collections/articles/records`,
          body: { data: { id: 1, title: "art" } },
        };

        beforeEach(() => {
          fetch
            .onCall(0)
            .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));
          fetch.onCall(1).returns(
            fakeServerResponse(200, {
              responses: [response],
            })
          );
        });

        it("should retry the request if option is specified", async () => {
          const r = await api
            .bucket("default")
            .collection("blog")
            .batch((batch) => batch.createRecord({}), {
              retry: 1,
            });
          return expect((r as OperationResponse[])[0]).eql(response);
        });
      });
    });

    describe("server response", () => {
      const fixtures = [
        { id: "1", title: "art1" },
        { id: "2", title: "art2" },
      ];

      it("should reject on HTTP 400", async () => {
        sandbox.stub(api.http as any, "fetchFunc").returns(
          fakeServerResponse(400, {
            error: true,
            errno: 117,
            message: "http 400",
          })
        );

        await expectAsyncError(() => executeBatch(fixtures), /HTTP 400/);
      });

      it("should reject on HTTP error status code", async () => {
        sandbox.stub(api.http as any, "fetchFunc").returns(
          fakeServerResponse(500, {
            error: true,
            message: "http 500",
          })
        );

        await expectAsyncError(() => executeBatch(fixtures), /HTTP 500/);
      });

      it("should expose succesful subrequest responses", async () => {
        const responses = [
          {
            status: 201,
            path: `/${SPV}/buckets/blog/collections/articles/records`,
            body: { data: fixtures[0] },
          },
          {
            status: 201,
            path: `/${SPV}/buckets/blog/collections/articles/records`,
            body: { data: fixtures[1] },
          },
        ];
        sandbox
          .stub(api.http as any, "fetchFunc")
          .returns(fakeServerResponse(200, { responses }));

        (await executeBatch(fixtures)).should.deep.equal(responses);
      });

      it("should expose failing subrequest responses", async () => {
        const missingRemotely = fixtures[0];
        const responses = [
          {
            status: 404,
            path: `/${SPV}/buckets/blog/collections/articles/records/1`,
            body: missingRemotely,
          },
        ];
        sandbox
          .stub(api.http as any, "fetchFunc")
          .returns(fakeServerResponse(200, { responses }));

        (await executeBatch(fixtures)).should.deep.equal(responses);
      });

      it("should resolve with encountered HTTP 500", async () => {
        const responses = [
          {
            status: 500,
            path: `/${SPV}/buckets/blog/collections/articles/records/1`,
            body: { 500: true },
          },
        ];
        sandbox
          .stub(api.http as any, "fetchFunc")
          .returns(fakeServerResponse(200, { responses }));

        (await executeBatch(fixtures)).should.deep.equal(responses);
      });

      it("should expose encountered HTTP 412", async () => {
        const responses = [
          {
            status: 412,
            path: `/${SPV}/buckets/blog/collections/articles/records/1`,
            body: { details: { existing: { title: "foo" } } },
          },
        ];
        sandbox
          .stub(api.http as any, "fetchFunc")
          .returns(fakeServerResponse(200, { responses }));

        (await executeBatch(fixtures)).should.deep.equal(responses);
      });
    });

    describe("Chunked requests", () => {
      // 4 operations, one more than the test limit which is 3
      const fixtures = [
        { id: "1", title: "foo" },
        { id: "2", title: "bar" },
        { id: "3", title: "baz" },
        { id: "4", title: "qux" },
      ];

      it("should chunk batch requests", async () => {
        sandbox
          .stub(api.http as any, "fetchFunc")
          .onFirstCall()
          .returns(
            fakeServerResponse(200, {
              responses: [
                { status: 200, body: { data: 1 } },
                { status: 200, body: { data: 2 } },
                { status: 200, body: { data: 3 } },
              ],
            })
          )
          .onSecondCall()
          .returns(
            fakeServerResponse(200, {
              responses: [{ status: 200, body: { data: 4 } }],
            })
          );
        const responses = (await executeBatch(fixtures)) as OperationResponse[];
        responses
          .map((response) => response.body.data)
          .should.deep.equal([1, 2, 3, 4]);
      });

      it("should not chunk batch requests if setting is falsy", async () => {
        const fetchServerSettings = sandbox.stub().returns(
          Promise.resolve({
            batch_max_requests: 0,
          })
        );
        sandbox.stub(api, "fetchServerSettings").get(() => fetchServerSettings);
        const fetchStub = sandbox.stub(api.http as any, "fetchFunc").returns(
          fakeServerResponse(200, {
            responses: [],
          })
        );
        await executeBatch(fixtures);
        return sinon.assert.calledOnce(fetchStub);
      });

      it("should map initial records to conflict objects", async () => {
        sandbox
          .stub(api.http as any, "fetchFunc")
          .onFirstCall()
          .returns(
            fakeServerResponse(200, {
              responses: [
                { status: 412, body: { details: { existing: { id: 1 } } } },
                { status: 412, body: { details: { existing: { id: 2 } } } },
                { status: 412, body: {} },
              ],
            })
          )
          .onSecondCall()
          .returns(
            fakeServerResponse(200, {
              responses: [
                { status: 412, body: { details: { existing: { id: 4 } } } },
              ],
            })
          );

        const responses = (await executeBatch(fixtures)) as OperationResponse[];
        responses
          .map((response) => response.status)
          .should.deep.equal([412, 412, 412, 412]);
      });

      it("should chunk batch requests concurrently", async () => {
        sandbox
          .stub(api.http as any, "fetchFunc")
          .onFirstCall()
          .returns(
            new Promise((resolve) => {
              function onTimeout() {
                resolve(
                  fakeServerResponse(200, {
                    responses: [
                      { status: 200, body: { data: 1 } },
                      { status: 200, body: { data: 2 } },
                      { status: 200, body: { data: 3 } },
                    ],
                  })
                );
              }
              setTimeout(onTimeout, 100);
            })
          )
          .onSecondCall()
          .returns(
            new Promise((resolve) => {
              function onTimeout() {
                resolve(
                  fakeServerResponse(200, {
                    responses: [{ status: 200, body: { data: 4 } }],
                  })
                );
              }
              setTimeout(onTimeout, 5);
            })
          );
        const responses = (await executeBatch(fixtures)) as OperationResponse[];
        responses
          .map((response) => response.body.data)
          .should.deep.equal([1, 2, 3, 4]);
      });
    });

    describe("Aggregate mode", () => {
      const fixtures = [
        { title: "art1" },
        { title: "art2" },
        { title: "art3" },
        { title: "art4" },
      ];

      it("should resolve with an aggregated result object", async () => {
        const responses: KintoBatchResponse[] = [
          {
            status: 200,
            path: "",
            body: {},
            headers: {},
          },
          {
            status: 200,
            path: "",
            body: {},
            headers: {},
          },
        ];
        sandbox
          .stub(api.http as any, "fetchFunc")
          .returns(fakeServerResponse(200, { responses }));

        const aggregateResponse = (await executeBatch(fixtures, {
          aggregate: true,
        })) as AggregateResponse;
        aggregateResponse.should.deep.equal({
          errors: [],
          published: [{}, {}, {}, {}],
          conflicts: [],
          skipped: [],
        });
      });
    });
  });

  /** @test {KintoClient#execute} */
  describe("#execute()", () => {
    it("should ensure passing defined allowed defined request options", async () => {
      sinon.stub(api, "fetchServerInfo").returns(Promise.resolve({} as any));
      const request = sinon
        .stub(api.http, "request")
        .returns(Promise.resolve({} as any));

      await api.execute({ path: "/foo", garbage: true } as any);
      sinon.assert.calledWith(
        request,
        "http://fake-server/v1/foo",
        {},
        { retry: 0 }
      );
    });
  });

  /** @test {KintoClient#paginatedList} */
  describe("#paginatedList()", () => {
    const ETag = '"42"';
    const path = "/some/path";
    let executeStub: Stub<typeof api.execute>;

    describe("No pagination", () => {
      beforeEach(() => {
        // Since listRecords use `raw: true`, stub with full response:
        executeStub = sandbox.stub(api, "execute").returns(
          Promise.resolve({
            json: { data: [{ a: 1 }] },
            headers: {
              get: (name: string) => {
                if (name === "ETag") {
                  return ETag;
                }
                return "";
              },
            },
          })
        );
      });

      it("should execute expected request", () => {
        api.paginatedList(path);

        sinon.assert.calledWithMatch(
          executeStub,
          { path: `${path}?_sort=-last_modified`, headers: {} },
          //@ts-ignore Limitation of the Parameters type for overloaded functions
          { raw: true }
        );
      });

      it("should sort records", () => {
        api.paginatedList(path, { sort: "title" });

        sinon.assert.calledWithMatch(
          executeStub,
          { path: `${path}?_sort=title`, headers: {} },
          //@ts-ignore Limitation of the Parameters type for overloaded functions
          { raw: true }
        );
      });

      it("should resolve with records list", async () => {
        (await api.paginatedList(path)).should.have
          .property("data")
          .eql([{ a: 1 }]);
      });

      it("should resolve with a next() function", async () => {
        (await api.paginatedList(path)).should.have
          .property("next")
          .to.be.a("function");
      });

      it("should support the since option", () => {
        api.paginatedList(path, { since: ETag });

        const qs = "_sort=-last_modified&_since=%2242%22";
        sinon.assert.calledWithMatch(executeStub, {
          path: `${path}?${qs}`,
          headers: {},
        });
      });

      it("should throw if the since option is invalid", async () => {
        await expectAsyncError(
          () => api.paginatedList(path, { since: 123 } as any),
          /Invalid value for since \(123\), should be ETag value/
        );
      });

      it("should resolve with the collection last_modified without quotes", async () => {
        (await api.paginatedList(path)).should.have
          .property("last_modified")
          .eql("42");
      });

      it("should resolve with the hasNextPage being set to false", async () => {
        (await api.paginatedList(path)).should.have
          .property("hasNextPage")
          .eql(false);
      });

      it("should pass fields through", () => {
        api.paginatedList(path, { fields: ["c", "d"] });

        sinon.assert.calledWithMatch(executeStub, {
          path: `${path}?_sort=-last_modified&_fields=c,d`,
          headers: {},
        });
      });
    });

    describe("Filtering", () => {
      let executeStub: Stub<typeof api.execute>;

      beforeEach(() => {
        executeStub = sandbox.stub(api, "execute").returns(
          Promise.resolve({
            json: { data: [] },
            headers: { get: () => {} },
          })
        );
      });

      it("should generate the expected filtering query string", () => {
        api.paginatedList(path, { sort: "x", filters: { min_y: 2, not_z: 3 } });

        const expectedQS = "min_y=2&not_z=3&_sort=x";
        sinon.assert.calledWithMatch(
          executeStub,
          { path: `${path}?${expectedQS}`, headers: {} },
          //@ts-ignore Limitation of the Parameters type for overloaded functions
          { raw: true }
        );
      });

      it("shouldn't need an explicit sort parameter", () => {
        api.paginatedList(path, { filters: { min_y: 2, not_z: 3 } });

        const expectedQS = "min_y=2&not_z=3&_sort=-last_modified";
        sinon.assert.calledWithMatch(
          executeStub,
          { path: `${path}?${expectedQS}`, headers: {} },
          //@ts-ignore Limitation of the Parameters type for overloaded functions
          { raw: true }
        );
      });
    });

    describe("Pagination", () => {
      let headersgetSpy: sinon.SinonStub;
      let executeStub: Stub<typeof api.execute>;

      it("should issue a request with the specified limit applied", () => {
        headersgetSpy = sandbox.stub().returns("");
        executeStub = sandbox.stub(api, "execute").returns(
          Promise.resolve({
            json: { data: [] },
            headers: { get: headersgetSpy },
          })
        );

        api.paginatedList(path, { limit: 2 });

        const expectedQS = "_sort=-last_modified&_limit=2";
        sinon.assert.calledWithMatch(
          executeStub,
          { path: `${path}?${expectedQS}`, headers: {} },
          //@ts-ignore Limitation of the Parameters type for overloaded functions
          { raw: true }
        );
      });

      it("should query for next page", async () => {
        const { http } = api;
        headersgetSpy = sandbox.stub().returns("http://next-page/");
        sandbox.stub(api, "execute").returns(
          Promise.resolve({
            json: { data: [] },
            headers: { get: headersgetSpy },
          })
        );
        const requestStub = sandbox.stub(http, "request").returns(
          Promise.resolve({
            status: 200,
            headers: new Headers(),
            json: { data: [] },
          })
        );

        await api.paginatedList(path, { limit: 2, pages: 2 });
        sinon.assert.calledWith(requestStub, "http://next-page/");
      });

      it("should aggregate paginated results", async () => {
        const { http } = api;
        sandbox
          .stub(http, "request")
          // first page
          .onFirstCall()
          .returns(
            Promise.resolve({
              status: 200,
              headers: new Headers({ "Next-Page": "http://next-page/" }),
              json: { data: [1, 2] },
            })
          )
          // second page
          .onSecondCall()
          .returns(
            Promise.resolve({
              status: 200,
              headers: new Headers(),
              json: { data: [3] },
            })
          );

        (await api.paginatedList(path, { limit: 2, pages: 2 })).should.have
          .property("data")
          .eql([1, 2, 3]);
      });

      it("should resolve with the hasNextPage being set to true", async () => {
        const { http } = api;
        sandbox
          .stub(http, "request")
          // first page
          .onFirstCall()
          .returns(
            Promise.resolve({
              status: 200,
              headers: new Headers({ "Next-Page": "http://next-page/" }),
              json: { data: [1, 2] },
            })
          );

        (await api.paginatedList(path)).should.have
          .property("hasNextPage")
          .eql(true);
      });
    });

    describe("Batch mode", () => {
      it("should not attempt at consumming response headers ", () => {
        // Emulate an ongoing batch operation
        (api as any)._isBatch = true;

        return api.paginatedList(path);
      });
    });
  });

  /** @test {KintoClient#listPermissions} */
  describe("#listPermissions()", () => {
    const data: PaginationResult<{ id: string }> = {
      last_modified: "",
      data: [{ id: "a" }, { id: "b" }],
      next: () => {
        return Promise.resolve(
          {} as unknown as PaginationResult<{
            id: string;
          }>
        );
      },
      hasNextPage: false,
      totalRecords: 2,
    };
    let executeStub: Stub<typeof api.execute>;

    describe("Capability available", () => {
      beforeEach(() => {
        api.serverInfo = {
          project_name: "",
          project_version: "",
          http_api_version: "",
          project_docs: "",
          url: "",
          settings: { readonly: false, batch_max_requests: 25 },
          capabilities: {
            permissions_endpoint: {
              description: "",
              url: "",
            },
          },
        };
        executeStub = sandbox
          .stub(api, "execute")
          .returns(
            Promise.resolve({ json: { data: [] }, headers: { get: () => "" } })
          );
      });

      it("should execute expected request", async () => {
        await api.listPermissions();
        sinon.assert.calledWithMatch(executeStub, {
          path: "/permissions?_sort=id",
          headers: {},
        });
      });

      it("should support passing custom headers", async () => {
        api._headers = { Foo: "Bar" };
        await api.listPermissions({ headers: { Baz: "Qux" } });
        sinon.assert.calledWithMatch(executeStub, {
          path: "/permissions?_sort=id",
          headers: { Foo: "Bar", Baz: "Qux" },
        });
      });

      it("should resolve with a result object", async () => {
        sandbox.stub(api, "paginatedList").returns(Promise.resolve(data));
        (await api.listPermissions()).should.have
          .property("data")
          .eql(data.data);
      });
    });

    describe("Capability unavailable", () => {
      it("should reject with an error when the capability is not available", async () => {
        api.serverInfo = {
          project_name: "",
          project_version: "",
          http_api_version: "",
          project_docs: "",
          url: "",
          settings: { readonly: false, batch_max_requests: 25 },
          capabilities: {},
        };

        await expectAsyncError(
          () => api.listPermissions(),
          /permissions_endpoint/
        );
      });
    });
  });

  /** @test {KintoClient#listBuckets} */
  describe("#listBuckets()", () => {
    const data: PaginationResult<{ id: string }> = {
      last_modified: "",
      data: [{ id: "a" }, { id: "b" }],
      next: () => {
        return Promise.resolve(
          {} as unknown as PaginationResult<{
            id: string;
          }>
        );
      },
      hasNextPage: false,
      totalRecords: 2,
    };
    let paginatedListStub: Stub<typeof api.paginatedList>;

    beforeEach(() => {
      paginatedListStub = sandbox
        .stub(api, "paginatedList")
        .returns(Promise.resolve(data));
    });

    it("should execute expected request", () => {
      api.listBuckets({ since: "42" });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets",
        { since: "42" },
        { headers: {}, retry: 0 }
      );
    });

    it("should support passing custom headers", () => {
      api._headers = { Foo: "Bar" };
      api.listBuckets({ headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets",
        {},
        { headers: { Foo: "Bar", Baz: "Qux" } }
      );
    });

    it("should resolve with a result object", async () => {
      (await api.listBuckets()).should.have.property("data").eql(data.data);
    });

    it("should support filters and fields", () => {
      api.listBuckets({ filters: { a: "b" }, fields: ["c", "d"] });

      sinon.assert.calledWithMatch(paginatedListStub, "/buckets", {
        filters: { a: "b" },
        fields: ["c", "d"],
      });
    });
  });

  /** @test {KintoClient#createBucket} */
  describe("#createBucket", () => {
    let executeStub: Stub<typeof api.execute>;

    beforeEach(() => {
      executeStub = sandbox.stub(api, "execute").returns(Promise.resolve());
    });

    it("should execute expected request", () => {
      api.createBucket("foo");

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/foo",
          headers: {},
          body: {
            data: { id: "foo" },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });

    it("should accept a data option", () => {
      api.createBucket("foo", { data: { a: 1 } });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/foo",
          headers: {},
          body: {
            data: { a: 1 },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });

    it("should accept a safe option", () => {
      api.createBucket("foo", { safe: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/foo",
          headers: { "If-None-Match": "*" },
          body: {
            data: { id: "foo" },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });

    it("should extend request headers with optional ones", () => {
      api._headers = { Foo: "Bar" };

      api.createBucket("foo", { headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/foo",
          headers: { Foo: "Bar", Baz: "Qux" },
          body: {
            data: { id: "foo" },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });
  });

  /** @test {KintoClient#deleteBucket} */
  describe("#deleteBucket()", () => {
    let executeStub: Stub<typeof api.execute>;

    beforeEach(() => {
      executeStub = sandbox.stub(api, "execute").returns(Promise.resolve());
    });

    it("should execute expected request", () => {
      api.deleteBucket("plop");

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/plop",
          headers: {},
        },
        { retry: 0 }
      );
    });

    it("should accept a bucket object", () => {
      api.deleteBucket({ id: "plop" });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/plop",
          headers: {},
        },
        { retry: 0 }
      );
    });

    it("should throw if safe is true and last_modified isn't provided", async () => {
      await expectAsyncError(
        () => api.deleteBucket("plop", { safe: true }),
        /Safe concurrency check requires a last_modified value./
      );
    });

    it("should rely on the provided last_modified for the safe option", () => {
      api.deleteBucket("plop", { last_modified: 42, safe: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/plop",
          headers: {
            "If-Match": `"42"`,
          },
        },
        { retry: 0 }
      );
    });

    it("should extend request headers with optional ones", () => {
      api._headers = { Foo: "Bar" };

      api.deleteBucket("plop", { headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/plop",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
          },
        },
        { retry: 0 }
      );
    });
  });

  /** @test {KintoClient#deleteBuckets} */
  describe("#deleteBuckets()", () => {
    let executeStub: Stub<typeof api.execute>;

    beforeEach(() => {
      api.serverInfo = {
        project_name: "",
        project_version: "",
        http_api_version: "1.4",
        project_docs: "",
        url: "",
        settings: { readonly: false, batch_max_requests: 25 },
        capabilities: {},
      };
      executeStub = sandbox.stub(api, "execute").returns(Promise.resolve({}));
    });

    it("should execute expected request", async () => {
      await api.deleteBuckets();

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets?_sort=-last_modified",
          headers: {},
        },
        { retry: 0 }
      );
    });

    it("should throw if safe is true and last_modified isn't provided", async () => {
      await expectAsyncError(
        () => api.deleteBuckets({ safe: true }),
        /Safe concurrency check requires a last_modified value./
      );
    });

    it("should rely on the provided last_modified for the safe option", async () => {
      await api.deleteBuckets({ last_modified: 42, safe: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets?_sort=-last_modified",
          headers: {
            "If-Match": `"42"`,
          },
        },
        { retry: 0 }
      );
    });

    it("should extend request headers with optional ones", async () => {
      api._headers = { Foo: "Bar" };

      await api.deleteBuckets({ headers: { Baz: "Qux" } });
      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets?_sort=-last_modified",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
          },
        },
        { retry: 0 }
      );
    });

    it("should accept a timestamp option", async () => {
      await api.deleteBuckets({ filters: { since: 42 } });
      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets?since=42&_sort=-last_modified",
          headers: {},
        },
        { retry: 0 }
      );
    });

    it("should support filters and fields", async () => {
      await api.deleteBuckets({
        filters: { a: "b" },
        fields: ["c", "d"],
      });
      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets?a=b&_sort=-last_modified&_fields=c,d",
          headers: {},
        },
        { retry: 0 }
      );
    });

    it("should reject if http_api_version mismatches", async () => {
      api.serverInfo = {
        project_name: "",
        project_version: "",
        http_api_version: "1.3",
        project_docs: "",
        url: "",
        settings: { readonly: false, batch_max_requests: 25 },
        capabilities: {},
      };

      await expectAsyncError(() => api.deleteBuckets(), /Version/);
    });
  });
});
