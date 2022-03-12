import sinon from "sinon";
import KintoClient from "../../src/http";
import Bucket from "../../src/http/bucket";
import Collection, { CollectionOptions } from "../../src/http/collection";
import {
  fakeServerResponse,
  Stub,
  expectAsyncError,
  fakeHeaders,
} from "./test_utils";
import { PaginationResult } from "../../src/http/base";

intern.getPlugin("chai").should();
const { describe, it, beforeEach, afterEach } =
  intern.getPlugin("interface.bdd");

const FAKE_SERVER_URL = "http://fake-server/v1";

/** @test {Collection} */
describe("HTTP Collection", () => {
  let sandbox: sinon.SinonSandbox, client: KintoClient, coll: Collection;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    client = new KintoClient(FAKE_SERVER_URL);
    const bucket = new Bucket(client, "blog", { headers: { Foo: "Bar" } });
    coll = new Collection(client, bucket, "posts", { headers: { Baz: "Qux" } });
  });

  afterEach(() => {
    sandbox.restore();
  });

  function getBlogPostsCollection(options?: CollectionOptions) {
    return new Bucket(client, "blog").collection("posts", options);
  }

  /** @test {Collection#getTotalRecords} */
  describe("#getTotalRecords()", () => {
    it("should execute expected request", async () => {
      const executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ headers: fakeHeaders() }));

      await getBlogPostsCollection().getTotalRecords();

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "HEAD",
          path: "/buckets/blog/collections/posts/records",
          headers: {},
        },
        { raw: true }
      );
    });

    it("should resolve with the Total-Records header value", async () => {
      sandbox.stub(client, "execute").returns(
        Promise.resolve({
          headers: {
            get() {
              return 42;
            },
          },
        })
      );

      (await getBlogPostsCollection().getTotalRecords()).should.equal(42);
    });
  });

  /** @test {Collection#getData} */
  describe("#getData()", () => {
    it("should execute expected request", async () => {
      const executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ headers: fakeHeaders() }));

      await getBlogPostsCollection().getData();

      sinon.assert.calledWithMatch(executeStub, {
        path: "/buckets/blog/collections/posts",
        headers: {},
      });
    });

    it("should resolve with response data", async () => {
      const response = { data: { foo: "bar" } };
      sandbox.stub(client, "execute").returns(Promise.resolve(response));

      const data = (await getBlogPostsCollection().getData()) as {
        foo: string;
      };
      data.should.deep.equal({
        foo: "bar",
      });
    });

    it("should pass query through", async () => {
      const requestStub = sandbox.stub(client.http, "request").returns(
        Promise.resolve({
          headers: fakeHeaders(),
          json: {},
          status: 200,
        })
      );

      await getBlogPostsCollection().getData({ query: { _expected: '"123"' } });

      sinon.assert.calledWithMatch(
        requestStub,
        "http://fake-server/v1/buckets/blog/collections/posts?_expected=%22123%22",
        {
          headers: {},
        }
      );
    });

    it("supports _fields", async () => {
      const requestStub = sandbox.stub(client.http, "request").returns(
        Promise.resolve({
          headers: fakeHeaders(),
          json: {},
          status: 200,
        })
      );

      await getBlogPostsCollection().getData({ fields: ["a", "b"] });

      sinon.assert.calledWithMatch(
        requestStub,
        "http://fake-server/v1/buckets/blog/collections/posts?_fields=a,b",
        {
          headers: {},
        }
      );
    });
  });

  /** @test {Collection#getPermissions} */
  describe("#getPermissions()", () => {
    beforeEach(() => {
      sandbox.stub(client, "execute").returns(
        Promise.resolve({
          data: {},
          permissions: { write: ["fakeperms"] },
        })
      );
    });

    it("should retrieve permissions", async () => {
      (await coll.getPermissions()).should.deep.equal({ write: ["fakeperms"] });
    });
  });

  /** @test {Collection#setPermissions} */
  describe("#setPermissions()", () => {
    const fakePermissions = { read: [] as string[], write: [] as string[] };
    let executeStub: Stub<typeof coll.client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({}));
    });

    it("should set permissions", () => {
      coll.setPermissions(fakePermissions);

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/collections/posts",
          headers: { Foo: "Bar", Baz: "Qux" },
          body: {
            data: undefined,
            permissions: fakePermissions,
          },
        },
        { retry: 0 }
      );
    });

    it("should handle the safe option", () => {
      coll.setPermissions(fakePermissions, { safe: true, last_modified: 42 });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/collections/posts",
          headers: { Foo: "Bar", Baz: "Qux", "If-Match": '"42"' },
          body: {
            data: undefined,
            permissions: fakePermissions,
          },
        },
        { retry: 0 }
      );
    });

    it("should resolve with json result", async () => {
      (await coll.setPermissions(fakePermissions)).should.deep.equal({});
    });
  });

  /** @test {Collection#addPermissions} */
  describe("#addPermissions()", () => {
    const fakePermissions = { read: [] as string[], write: [] as string[] };
    let executeStub: Stub<typeof coll.client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({}));
    });

    it("should append permissions", () => {
      coll.addPermissions(fakePermissions);

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PATCH",
          path: "/buckets/blog/collections/posts",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
            "Content-Type": "application/json-patch+json",
          },
          body: [],
        },
        { retry: 0 }
      );
    });

    it("should handle the safe option", () => {
      coll.addPermissions(fakePermissions, { safe: true, last_modified: 42 });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PATCH",
          path: "/buckets/blog/collections/posts",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
            "Content-Type": "application/json-patch+json",
            "If-Match": `"42"`,
          },
          body: [],
        },
        { retry: 0 }
      );
    });

    it("should resolve with json result", async () => {
      (await coll.setPermissions(fakePermissions)).should.deep.equal({});
    });
  });

  /** @test {Collection#removePermissions} */
  describe("#removePermissions()", () => {
    const fakePermissions = { read: [] as string[], write: [] as string[] };
    let executeStub: Stub<typeof coll.client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({}));
    });

    it("should pop permissions", () => {
      coll.setPermissions(fakePermissions);

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/collections/posts",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
          },
          body: { data: undefined, permissions: fakePermissions },
        },
        { retry: 0 }
      );
    });

    it("should handle the safe option", () => {
      coll.setPermissions(fakePermissions, { safe: true, last_modified: 42 });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/collections/posts",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
            "If-Match": `"42"`,
          },
          body: { data: undefined, permissions: fakePermissions },
        },
        { retry: 0 }
      );
    });

    it("should resolve with json result", async () => {
      (await coll.setPermissions(fakePermissions)).should.deep.equal({});
    });
  });

  /** @test {Collection#setData} */
  describe("#setData()", () => {
    let executeStub: Stub<typeof coll.client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: { foo: "bar" } }));
    });

    it("should set the data", () => {
      coll.setData({ a: 1 });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/collections/posts",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
          },
          body: { data: { a: 1 } },
        },
        { retry: 0 }
      );
    });

    it("should handle the safe option", () => {
      coll.setData({ a: 1 }, { safe: true, last_modified: 42 });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/collections/posts",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
            "If-Match": `"42"`,
          },
          body: { data: { a: 1 } },
        },
        { retry: 0 }
      );
    });

    it("should handle the patch option", () => {
      coll.setData({ a: 1 }, { patch: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PATCH",
          path: "/buckets/blog/collections/posts",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
          },
          body: { data: { a: 1 } },
        },
        { retry: 0 }
      );
    });

    it("should resolve with json result", async () => {
      (await coll.setData({ a: 1 })).should.deep.equal({
        data: { foo: "bar" },
      });
    });
  });

  /** @test {Collection#createRecord} */
  describe("#createRecord()", () => {
    const record = { title: "foo" };
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: 1 }));
    });

    it("should create the expected request", () => {
      coll.createRecord(record);

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "POST",
          path: "/buckets/blog/collections/posts/records",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
          },
          body: { data: record },
        },
        { retry: 0 }
      );
    });

    it("should accept a safe option", () => {
      coll.createRecord(record, { safe: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "POST",
          path: "/buckets/blog/collections/posts/records",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
            "If-None-Match": "*",
          },
          body: { data: record },
        },
        { retry: 0 }
      );
    });

    it("should execute the expected request", () => {
      return coll.createRecord(record).then(() => {
        sinon.assert.calledWithMatch(executeStub, {
          path: "/buckets/blog/collections/posts/records",
          headers: {},
        });
      });
    });

    it("should resolve with response body", async () => {
      (await coll.createRecord(record)).should.deep.equal({ data: 1 });
    });
  });

  /** @test {Collection#updateRecord} */
  describe("#updateRecord()", () => {
    const record = { id: "2", title: "foo" };
    let executeStub: Stub<typeof coll.client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: 1 }));
    });

    it("should throw if record is not an object", async () => {
      await expectAsyncError(
        () => coll.updateRecord(2 as any),
        /record object is required/
      );
    });

    it("should throw if id is missing", async () => {
      await expectAsyncError(
        () => coll.updateRecord({} as any),
        /record id is required/
      );
    });

    it("should create the expected request", () => {
      coll.updateRecord(record);

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/collections/posts/records/2",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
          },
          body: { data: record },
        },
        { retry: 0 }
      );
    });

    it("should accept a safe option", () => {
      coll.updateRecord({ ...record, last_modified: 42 }, { safe: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/collections/posts/records/2",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
            "If-Match": `"42"`,
          },
          body: { data: record },
        },
        { retry: 0 }
      );
    });

    it("should accept a patch option", () => {
      coll.updateRecord(record, { patch: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PATCH",
          path: "/buckets/blog/collections/posts/records/2",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
          },
          body: { data: record, permissions: undefined },
        },
        { retry: 0 }
      );
    });

    it("should resolve with response body", async () => {
      (await coll.updateRecord(record)).should.deep.equal({ data: 1 });
    });
  });

  /** @test {Collection#deleteRecord} */
  describe("#deleteRecord()", () => {
    // let deleteRequestStub: Stub<typeof requests.deleteRequest>;
    let executeStub: Stub<typeof coll.client.execute>;

    beforeEach(() => {
      // deleteRequestStub = sandbox.stub(requests, "deleteRequest");
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: 1 }));
    });

    it("should throw if id is missing", async () => {
      await expectAsyncError(
        () => coll.deleteRecord({} as any),
        /record id is required/
      );
    });

    it("should delete a record", () => {
      coll.deleteRecord("1");

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/blog/collections/posts/records/1",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
          },
        },
        { retry: 0 }
      );
    });

    it("should throw if safe is true and last_modified isn't provided", async () => {
      await expectAsyncError(
        () => coll.deleteRecord("1", { safe: true }),
        /Safe concurrency check requires a last_modified value./
      );
    });

    it("should rely on the provided last_modified for the safe option", () => {
      coll.deleteRecord({ id: "1", last_modified: 42 }, { safe: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/blog/collections/posts/records/1",
          headers: {
            Foo: "Bar",
            Baz: "Qux",
            "If-Match": `"42"`,
          },
        },
        { retry: 0 }
      );
    });
  });

  /** @test {Collection#deleteRecords} */
  describe("#deleteRecords()", () => {
    let executeStub: Stub<typeof coll.client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: {} }));
    });

    it("should delete all records", () => {
      coll.deleteRecords();

      sinon.assert.calledWithMatch(executeStub, {
        method: "DELETE",
        path: "/buckets/blog/collections/posts/records?_sort=-last_modified",
        headers: {},
      });
    });

    it("should accept a timestamp option", () => {
      coll.deleteRecords({
        filters: { since: 42 },
      });

      sinon.assert.calledWithMatch(executeStub, {
        method: "DELETE",
        path: "/buckets/blog/collections/posts/records?since=42&_sort=-last_modified",
        headers: {},
      });
    });

    it("should extend request headers with optional ones", () => {
      coll["_headers"] = { Foo: "Bar" };
      coll.deleteRecords({ headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(executeStub, {
        method: "DELETE",
        path: "/buckets/blog/collections/posts/records?_sort=-last_modified",
        headers: { Foo: "Bar", Baz: "Qux" },
      });
    });

    it("should support filters and fields", () => {
      coll.deleteRecords({
        filters: { a: "b" },
        fields: ["c", "d"],
      });

      sinon.assert.calledWithMatch(executeStub, {
        method: "DELETE",
        path: "/buckets/blog/collections/posts/records?a=b&_sort=-last_modified&_fields=c,d",
        headers: {},
      });
    });
  });

  /** @test {Collection#getRecord} */
  describe("#getRecord()", () => {
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: 1 }));
    });

    it("should execute expected request", () => {
      coll.getRecord("1");

      sinon.assert.calledWith(executeStub, {
        path: "/buckets/blog/collections/posts/records/1",
        headers: { Foo: "Bar", Baz: "Qux" },
      });
    });

    it("should retrieve a record", async () => {
      (await coll.getRecord("1")).should.deep.equal({ data: 1 });
    });

    it("should support query and fields", () => {
      coll.getRecord("1", { query: { a: "b" }, fields: ["c", "d"] });

      sinon.assert.calledWith(
        executeStub,
        {
          headers: { Baz: "Qux", Foo: "Bar" },
          path: "/buckets/blog/collections/posts/records/1",
        },
        { fields: ["c", "d"], query: { a: "b" }, retry: 0 }
      );
    });
  });

  /** @test {Collection#getRecordsTimestamp} */
  describe("#getRecordsTimestamp()", () => {
    it("should execute expected request", async () => {
      const executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ headers: fakeHeaders() }));

      await getBlogPostsCollection().getRecordsTimestamp();

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "HEAD",
          path: "/buckets/blog/collections/posts/records",
          headers: {},
        },
        { raw: true }
      );
    });

    it("should resolve with the ETag header value", async () => {
      const etag = '"42"';
      sandbox.stub(client, "execute").returns(
        Promise.resolve({
          headers: {
            get(value: string) {
              return value == "ETag" ? etag : null;
            },
          },
        })
      );

      (await getBlogPostsCollection().getRecordsTimestamp())!.should.deep.equal(
        etag
      );
    });
  });

  /** @test {Collection#listRecords} */
  describe("#listRecords()", () => {
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
    let paginatedListStub: Stub<typeof coll.client.paginatedList>;

    beforeEach(() => {
      paginatedListStub = sandbox
        .stub(coll.client, "paginatedList")
        .returns(Promise.resolve(data));
    });

    it("should execute expected request", () => {
      coll.listRecords({ since: "42" });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets/blog/collections/posts/records",
        { since: "42" },
        { headers: { Baz: "Qux", Foo: "Bar" }, retry: 0 }
      );
    });

    it("should support passing custom headers", () => {
      coll.listRecords({ headers: { "Another-Header": "Hello" } });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets",
        {},
        { headers: { Foo: "Bar", Baz: "Qux", "Another-Header": "Hello" } }
      );
    });

    it("should resolve with a result object", async () => {
      (await coll.listRecords()).should.have.property("data").eql(data.data);
    });

    it("should support filters and fields", () => {
      coll.listRecords({ filters: { a: "b" }, fields: ["c", "d"] });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets/blog/collections/posts/records",
        { filters: { a: "b" }, fields: ["c", "d"] }
      );
    });

    describe("Retry", () => {
      const response = { data: [{ id: 1, title: "art" }] };

      beforeEach(() => {
        sandbox.restore();
        const fetchStub = sandbox.stub(client.http as any, "fetchFunc");
        fetchStub
          .onCall(0)
          .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));
        fetchStub.onCall(1).returns(fakeServerResponse(200, response));
      });

      it("should retry the request if option is specified", async () => {
        const { data } = await coll.listRecords({ retry: 1 });
        data[0].should.have.property("title").eql("art");
      });
    });
  });

  /** @test {Collection#batch} */
  describe("#batch()", () => {
    it("should batch operations", () => {
      const batchStub = sandbox.stub();
      sandbox.stub(client, "batch").get(() => batchStub);
      // @ts-ignore
      const fn = (batch: any) => {};

      coll.batch(fn);

      sinon.assert.calledWith(batchStub, fn, {
        bucket: "blog",
        collection: "posts",
        headers: { Foo: "Bar", Baz: "Qux" },
        retry: 0,
        safe: false,
        aggregate: false,
      });
    });
  });

  /** @test {Collection#execute} */
  describe("#execute()", () => {
    it("should rely on client execute", () => {
      const executeStub = sandbox.stub();
      sandbox.stub(client, "execute").get(() => executeStub);
      const req = { path: "/", headers: {} };

      coll.execute(req);

      sinon.assert.calledWith(executeStub, req);
    });
  });
});
