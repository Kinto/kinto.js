import sinon from "sinon";
import KintoClient from "../../src/http";
import Bucket, { BucketOptions } from "../../src/http/bucket";
import Collection from "../../src/http/collection";
import { PaginationResult } from "../../src/http/base";
import { Stub, expectAsyncError, fakeHeaders } from "../test_utils";

const { expect } = intern.getPlugin("chai");
intern.getPlugin("chai").should();
const { describe, it, beforeEach, afterEach } =
  intern.getPlugin("interface.bdd");

const FAKE_SERVER_URL = "http://fake-server/v1";

/** @test {Bucket} */
describe("Bucket", () => {
  let sandbox: sinon.SinonSandbox, client: KintoClient;

  function getBlogBucket(options?: BucketOptions) {
    return new Bucket(client, "blog", options);
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    client = new KintoClient(FAKE_SERVER_URL);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("Options handling", () => {
    it("should accept options", () => {
      const options = { headers: { Foo: "Bar" }, safe: true };
      const bucket = getBlogBucket(options);
      expect(bucket).property("_headers", options.headers);
      expect(bucket).property("_safe", options.safe);
    });
  });

  /** @test {Bucket#getData} */
  describe("#getData()", () => {
    it("should execute expected request", async () => {
      const executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ headers: fakeHeaders() }));

      await getBlogBucket().getData();

      sinon.assert.calledWithMatch(executeStub, {
        path: "/buckets/blog",
        headers: {},
      });
    });

    it("should resolve with response data", async () => {
      const response = { data: { foo: "bar" }, permissions: {} };
      sandbox.stub(client, "execute").returns(Promise.resolve(response));

      const data = (await getBlogBucket().getData()) as { foo: string };
      data.should.deep.equal({
        foo: "bar",
      });
    });

    it("should support query and fields", () => {
      const response = { data: { foo: "bar" }, permissions: {} };
      const requestStub = sandbox.stub(client.http, "request").returns(
        Promise.resolve({
          headers: fakeHeaders(),
          json: response,
          status: 200,
        })
      );

      getBlogBucket().getData({ query: { a: "b" }, fields: ["c", "d"] });

      sinon.assert.calledWithMatch(
        requestStub,
        "http://fake-server/v1/buckets/blog?a=b&_fields=c,d",
        {
          headers: {},
        }
      );
    });
  });

  describe("#setData()", () => {
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: 1 }));
    });

    it("should set the bucket data", () => {
      getBlogBucket().setData({ a: 1 });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog",
          headers: {},
          body: {
            data: { id: "blog", a: 1 },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });

    it("should handle the patch option", () => {
      getBlogBucket().setData({ a: 1 }, { patch: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PATCH",
          path: "/buckets/blog",
          headers: {},
          body: {
            data: { id: "blog", a: 1 },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });

    it("should handle the safe option", () => {
      getBlogBucket().setData({ a: 1 }, { safe: true, last_modified: 42 });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog",
          headers: { "If-Match": `"42"` },
          body: {
            data: { id: "blog", a: 1 },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });

    it("should resolve with json result", async () => {
      (await getBlogBucket().setData({ a: 1 })).should.deep.equal({ data: 1 });
    });
  });

  /** @test {Bucket#collection} */
  describe("#collection()", () => {
    it("should return a Collection instance", () => {
      expect(getBlogBucket().collection("posts")).to.be.an.instanceOf(
        Collection
      );
    });

    it("should return a named collection", () => {
      expect(getBlogBucket().collection("posts").name).eql("posts");
    });

    it("should propagate bucket options", () => {
      const collection = getBlogBucket({
        headers: { Foo: "Bar" },
        safe: true,
      }).collection("posts", { headers: { Baz: "Qux" }, safe: false });
      expect(collection._headers).eql({ Foo: "Bar", Baz: "Qux" });
      expect(collection._retry).eql(0);
      expect(collection._safe).eql(false);
    });
  });

  /** @test {Bucket#getCollectionsTimestamp} */
  describe("#getCollectionsTimestamp()", () => {
    it("should execute expected request", async () => {
      const executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ headers: fakeHeaders() }));

      await getBlogBucket().getCollectionsTimestamp();

      sinon.assert.calledWithMatch(
        executeStub,
        { method: "HEAD", path: "/buckets/blog/collections", headers: {} },
        //@ts-ignore Limitation of the Parameters type for overloaded functions
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

      (await getBlogBucket().getCollectionsTimestamp())!.should.deep.equal(
        etag
      );
    });
  });

  /** @test {Bucket#listCollections} */
  describe("#listCollections()", () => {
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
    let paginatedListStub: Stub<typeof client.paginatedList>;

    beforeEach(() => {
      paginatedListStub = sandbox
        .stub(client, "paginatedList")
        .returns(Promise.resolve(data));
    });

    it("should list bucket collections", () => {
      getBlogBucket().listCollections({ since: "42" });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets/blog/collections",
        { since: "42" },
        { headers: {} }
      );
    });

    it("should merge default options", () => {
      getBlogBucket({
        headers: { Foo: "Bar" },
      }).listCollections({ headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets/blog/collections",
        {},
        { headers: { Foo: "Bar", Baz: "Qux" } }
      );
    });

    it("should support filters and fields", () => {
      getBlogBucket().listCollections({
        filters: { a: "b" },
        fields: ["c", "d"],
      });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets/blog/collections",
        { filters: { a: "b" }, fields: ["c", "d"] }
      );
    });

    it("should return the list of collections", async () => {
      (await getBlogBucket().listCollections()).should.deep.equal(data);
    });
  });

  /** @test {Bucket#createCollection} */
  describe("#createCollection()", () => {
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: {} }));
    });

    it("should accept a safe option", () => {
      getBlogBucket().createCollection("foo", { safe: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/collections/foo",
          headers: { "If-None-Match": `*` },
          body: {
            data: { id: "foo" },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });

    it("should extend request headers with optional ones", () => {
      getBlogBucket({
        headers: { Foo: "Bar" },
      }).createCollection("foo", { headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/collections/foo",
          headers: { Baz: "Qux" },
          body: {
            data: { id: "foo" },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });

    describe("Named collection", () => {
      it("should create a named collection", () => {
        getBlogBucket().createCollection("foo");

        sinon.assert.calledWithMatch(
          executeStub,
          {
            method: "PUT",
            path: "/buckets/blog/collections/foo",
            headers: {},
            body: {
              data: { id: "foo" },
              permissions: undefined,
            },
          },
          { retry: 0 }
        );
      });

      it("should merge default options", () => {
        getBlogBucket({
          headers: { Foo: "Bar" },
          safe: true,
        }).createCollection("foo", { headers: { Baz: "Qux" } });

        sinon.assert.calledWithMatch(
          executeStub,
          {
            method: "PUT",
            path: "/buckets/blog/collections/foo",
            headers: { Foo: "Bar", Baz: "Qux", "If-None-Match": "*" },
            body: {
              data: { id: "foo" },
              permissions: undefined,
            },
          },
          { retry: 0 }
        );
      });
    });

    describe("Unnamed collection", () => {
      it("should create an unnamed collection", () => {
        getBlogBucket().createCollection();

        sinon.assert.calledWithMatch(
          executeStub,
          {
            method: "POST",
            path: "/buckets/blog/collections",
            headers: {},
            body: {
              data: {},
              permissions: undefined,
            },
          },
          { retry: 0 }
        );
      });

      it("should merge default options", () => {
        getBlogBucket({
          headers: { Foo: "Bar" },
          safe: true,
        }).createCollection("", { headers: { Baz: "Qux" } });

        sinon.assert.calledWithMatch(
          executeStub,
          {
            method: "POST",
            path: "/buckets/blog/collections",
            headers: { Foo: "Bar", Baz: "Qux", "If-None-Match": "*" },
            body: {
              data: {},
              permissions: undefined,
            },
          },
          { retry: 0 }
        );
      });
    });
  });

  /** @test {Bucket#deleteCollection} */
  describe("#deleteCollection", () => {
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: {} }));
    });

    it("should delete a collection", () => {
      getBlogBucket().deleteCollection("todelete");

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/blog/collections/todelete",
          headers: {},
        },
        { retry: 0 }
      );
    });

    it("should merge default options", () => {
      getBlogBucket({
        headers: { Foo: "Bar" },
        safe: true,
      }).deleteCollection("todelete", {
        headers: { Baz: "Qux" },
        last_modified: 42,
      });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/blog/collections/todelete",
          headers: { Baz: "Qux", "If-Match": `"42"` },
        },
        { retry: 0 }
      );
    });

    it("should throw if safe is true and last_modified isn't provided", async () => {
      await expectAsyncError(
        () => getBlogBucket().deleteCollection("todelete", { safe: true }),
        /Safe concurrency check requires a last_modified value./
      );
    });

    it("should rely on the provided last_modified for the safe option", () => {
      getBlogBucket().deleteCollection(
        { id: "todelete", last_modified: 42 },
        { safe: true }
      );

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/blog/collections/todelete",
          headers: { "If-Match": `"42"` },
        },
        { retry: 0 }
      );
    });

    it("should extend request headers with optional ones", () => {
      getBlogBucket({
        headers: { Foo: "Bar" },
      }).deleteCollection("todelete", { headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/blog/collections/todelete",
          headers: { Foo: "Bar", Baz: "Qux" },
        },
        { retry: 0 }
      );
    });
  });

  /** @test {Bucket#deleteCollections} */
  describe("#deleteCollections", () => {
    let executeStub: sinon.SinonStub;
    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: {} }));
    });

    it("should delete all collections", () => {
      getBlogBucket().deleteCollections();

      sinon.assert.calledWithMatch(executeStub, {
        method: "DELETE",
        path: "/buckets/blog/collections?_sort=-last_modified",
        headers: {},
      });
    });

    it("should accept a timestamp option", () => {
      getBlogBucket().deleteCollections({
        filters: { since: 42 },
      });

      sinon.assert.calledWithMatch(executeStub, {
        method: "DELETE",
        path: "/buckets/blog/collections?since=42&_sort=-last_modified",
        headers: {},
      });
    });

    it("should merge default options", () => {
      getBlogBucket({
        headers: { Foo: "Bar" },
      }).deleteCollections({ headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(executeStub, {
        path: "/buckets/blog/collections?_sort=-last_modified",
        headers: { Foo: "Bar", Baz: "Qux" },
      });
    });

    it("should support filters and fields", () => {
      getBlogBucket().deleteCollections({
        filters: { a: "b" },
        fields: ["c", "d"],
      });

      sinon.assert.calledWithMatch(executeStub, {
        path: "/buckets/blog/collections?a=b&_sort=-last_modified&_fields=c,d",
        headers: {},
      });
    });
  });

  /** @test {Bucket#getGroupsTimestamp} */
  describe("#getGroupsTimestamp()", () => {
    it("should execute expected request", async () => {
      const executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ headers: fakeHeaders() }));

      await getBlogBucket().getGroupsTimestamp();

      sinon.assert.calledWithMatch(
        executeStub,
        { method: "HEAD", path: "/buckets/blog/groups", headers: {} },
        //@ts-ignore Limitation of the Parameters type for overloaded functions
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

      (await getBlogBucket().getGroupsTimestamp())!.should.deep.equal(etag);
    });
  });

  /** @test {Bucket#listGroups} */
  describe("#listGroups()", () => {
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
    let paginatedListStub: Stub<typeof client.paginatedList>;

    beforeEach(() => {
      paginatedListStub = sandbox
        .stub(client, "paginatedList")
        .returns(Promise.resolve(data));
    });

    it("should list bucket groups", () => {
      getBlogBucket().listGroups({ since: "42" });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets/blog/groups",
        { since: "42" },
        { headers: {} }
      );
    });

    it("should merge default options", () => {
      getBlogBucket({
        headers: { Foo: "Bar" },
      }).listGroups({ headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        paginatedListStub,
        "/buckets/blog/groups",
        {},
        { headers: { Foo: "Bar", Baz: "Qux" } }
      );
    });

    it("should support filters and fields", () => {
      getBlogBucket().listGroups({ filters: { a: "b" }, fields: ["c", "d"] });

      sinon.assert.calledWithMatch(paginatedListStub, "/buckets/blog/groups", {
        filters: { a: "b" },
        fields: ["c", "d"],
      });
    });

    it("should return the list of groups", async () => {
      (await getBlogBucket().listGroups()).should.deep.equal(data);
    });
  });

  /** @test {Bucket#getGroup} */
  describe("#getGroup", () => {
    const fakeGroup = { data: {}, permissions: {} };
    let executeStub: Stub<typeof client.execute>;

    it("should extend request headers with optional ones", () => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve(fakeGroup));

      getBlogBucket({
        headers: { Foo: "Bar" },
      }).getGroup("foo", { headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(executeStub, {
        path: "/buckets/blog/groups/foo",
        headers: { Foo: "Bar", Baz: "Qux" },
      });
    });

    it("should return the group", async () => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve(fakeGroup));

      (await getBlogBucket().getGroup("foo")).should.deep.equal(fakeGroup);
    });

    it("should support query and fields", () => {
      const requestStub = sandbox.stub(client.http, "request").returns(
        Promise.resolve({
          headers: fakeHeaders(),
          json: {},
          status: 200,
        })
      );

      getBlogBucket().getGroup("foo", {
        query: { a: "b" },
        fields: ["c", "d"],
      });

      sinon.assert.calledWithMatch(
        requestStub,
        "http://fake-server/v1/buckets/blog/groups/foo?a=b&_fields=c,d",
        {
          headers: {},
        }
      );
    });
  });

  /** @test {Bucket#createGroup} */
  describe("#createGroup", () => {
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: {} }));
    });

    it("should accept a safe option", () => {
      getBlogBucket().createGroup("foo", [], { safe: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/groups/foo",
          headers: { "If-None-Match": `*` },
          body: { data: { id: "foo", members: [] }, permissions: undefined },
        },
        { retry: 0 }
      );
    });

    it("should extend request headers with optional ones", () => {
      getBlogBucket({
        headers: { Foo: "Bar" },
      }).createGroup("foo", [], { headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/groups/foo",
          headers: { Foo: "Bar", Baz: "Qux" },
          body: { data: { id: "foo", members: [] }, permissions: undefined },
        },
        { retry: 0 }
      );
    });

    it("should create a group with empty list of members", () => {
      getBlogBucket().createGroup("foo");

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/groups/foo",
          headers: {},
          body: { data: { id: "foo", members: [] }, permissions: undefined },
        },
        { retry: 0 }
      );
    });

    it("should create a group with optional data and permissions", () => {
      const group = {
        data: { age: 21 },
        permissions: { write: ["github:leplatrem"] },
      };
      getBlogBucket().createGroup("foo", [], group);

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/groups/foo",
          headers: {},
          body: {
            data: { id: "foo", members: [], age: 21 },
            permissions: group.permissions,
          },
        },
        { retry: 0 }
      );
    });
  });

  /** @test {Bucket#updateGroup} */
  describe("#updateGroup", () => {
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: {} }));
    });

    it("should throw if record is not an object", async () => {
      await expectAsyncError(
        () => getBlogBucket().updateGroup(undefined as any),
        /group object is required/
      );
    });

    it("should throw if id is missing", async () => {
      expectAsyncError(
        () => getBlogBucket().updateGroup({} as any),
        /group id is required/
      );
    });

    it("should accept a patch option", () => {
      getBlogBucket().updateGroup({ id: "foo", members: [] }, { patch: true });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PATCH",
          path: "/buckets/blog/groups/foo",
          headers: {},
          body: {
            data: { id: "foo", members: [] },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });

    it("should extend request headers with optional ones", () => {
      getBlogBucket({
        headers: { Foo: "Bar" },
      }).updateGroup({ id: "foo", members: [] }, { headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/groups/foo",
          headers: { Foo: "Bar", Baz: "Qux" },
          body: {
            data: { id: "foo", members: [] },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });

    it("should update the group from first argument", () => {
      getBlogBucket().updateGroup({ id: "foo", members: [] });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/groups/foo",
          headers: {},
          body: {
            data: { id: "foo", members: [] },
            permissions: undefined,
          },
        },
        { retry: 0 }
      );
    });

    it("should update the group with optional data and permissions", () => {
      const group = {
        data: { age: 21 },
        permissions: { write: ["github:leplatrem"] },
      };
      getBlogBucket().updateGroup({ id: "foo", members: [] }, group);

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog/groups/foo",
          headers: {},
          body: {
            data: { id: "foo", members: [], age: 21 },
            permissions: group.permissions,
          },
        },
        { retry: 0 }
      );
    });
  });

  /** @test {Bucket#updateGroup} */
  describe("#deleteGroup", () => {
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: {} }));
    });

    it("should delete a group", () => {
      getBlogBucket().deleteGroup("todelete");

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/blog/groups/todelete",
          headers: {},
        },
        { retry: 0 }
      );
    });

    it("should merge default options", () => {
      getBlogBucket({
        headers: { Foo: "Bar" },
        safe: true,
      }).deleteGroup("todelete", {
        headers: { Baz: "Qux" },
        last_modified: 42,
      });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/blog/groups/todelete",
          headers: { Foo: "Bar", Baz: "Qux", "If-Match": `"42"` },
        },
        { retry: 0 }
      );
    });

    it("should throw if safe is true and last_modified isn't provided", async () => {
      await expectAsyncError(
        () => getBlogBucket().deleteGroup("todelete", { safe: true }),
        /Safe concurrency check requires a last_modified value./
      );
    });

    it("should rely on the provided last_modified for the safe option", () => {
      getBlogBucket().deleteGroup(
        { id: "todelete", last_modified: 42 },
        { safe: true }
      );

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/blog/groups/todelete",
          headers: { "If-Match": `"42"` },
        },
        { retry: 0 }
      );
    });

    it("should extend request headers with optional ones", () => {
      getBlogBucket({
        headers: { Foo: "Bar" },
      }).deleteGroup("todelete", { headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "DELETE",
          path: "/buckets/blog/groups/todelete",
          headers: { Foo: "Bar", Baz: "Qux" },
        },
        { retry: 0 }
      );
    });
  });

  /** @test {Bucket#deleteGroups} */
  describe("#deleteGroups", () => {
    let executeStub: sinon.SinonStub;
    beforeEach(() => {
      executeStub = sandbox
        .stub(client, "execute")
        .returns(Promise.resolve({ data: {} }));
    });

    it("should delete all Groups", () => {
      getBlogBucket().deleteGroups();

      sinon.assert.calledWithMatch(executeStub, {
        method: "DELETE",
        path: "/buckets/blog/groups?_sort=-last_modified",
        headers: {},
      });
    });

    it("should accept a timestamp option", () => {
      getBlogBucket().deleteGroups({
        filters: { since: 42 },
      });

      sinon.assert.calledWithMatch(executeStub, {
        method: "DELETE",
        path: "/buckets/blog/groups?since=42&_sort=-last_modified",
        headers: {},
      });
    });

    it("should merge default options", () => {
      getBlogBucket({
        headers: { Foo: "Bar" },
      }).deleteGroups({ headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(executeStub, {
        method: "DELETE",
        path: "/buckets/blog/groups?_sort=-last_modified",
        headers: { Foo: "Bar", Baz: "Qux" },
      });
    });

    it("should support filters and fields", () => {
      getBlogBucket().deleteGroups({
        filters: { a: "b" },
        fields: ["c", "d"],
      });

      sinon.assert.calledWithMatch(executeStub, {
        method: "DELETE",
        path: "/buckets/blog/groups?a=b&_sort=-last_modified&_fields=c,d",
        headers: {},
      });
    });
  });

  /** @test {Bucket#getPermissions} */
  describe("#getPermissions()", () => {
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox.stub(client, "execute").returns(
        Promise.resolve({
          data: {},
          permissions: { write: ["fakeperms"] },
        })
      );
    });

    it("should retrieve permissions", async () => {
      const bucket = getBlogBucket();
      (await bucket.getPermissions()).should.deep.equal({
        write: ["fakeperms"],
      });
    });

    it("should merge default options", () => {
      const bucket = getBlogBucket({ headers: { Foo: "Bar" }, safe: true });

      return bucket.getPermissions({ headers: { Baz: "Qux" } }).then((_) => {
        sinon.assert.calledWithMatch(executeStub, {
          path: "/buckets/blog",
          headers: { Baz: "Qux", Foo: "Bar" },
        });
      });
    });
  });

  /** @test {Bucket#setPermissions} */
  describe("#setPermissions()", () => {
    const fakePermissions = { read: [] as string[], write: [] as string[] };
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox.stub(client, "execute").returns(
        Promise.resolve({
          data: {},
          permissions: fakePermissions,
        })
      );
    });

    it("should set permissions", () => {
      getBlogBucket().setPermissions(fakePermissions);

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog",
          headers: {},
          body: { permissions: fakePermissions },
        },
        { retry: 0 }
      );
    });

    it("should merge default options", () => {
      const bucket = getBlogBucket({ headers: { Foo: "Bar" }, safe: true });

      bucket.setPermissions(fakePermissions, { headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog",
          headers: { Foo: "Bar", Baz: "Qux", "If-None-Match": "*" },
          body: { permissions: fakePermissions },
        },
        { retry: 0 }
      );
    });

    it("should accept a last_modified option", () => {
      const bucket = getBlogBucket({ headers: { Foo: "Bar" }, safe: true });

      bucket.setPermissions(fakePermissions, { last_modified: 42 });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PUT",
          path: "/buckets/blog",
          headers: { Foo: "Bar", "If-Match": `"42"` },
          body: { permissions: fakePermissions },
        },
        { retry: 0 }
      );
    });

    it("should resolve with response data", async () => {
      (await getBlogBucket().setPermissions(fakePermissions)).should.have
        .property("permissions")
        .eql(fakePermissions);
    });
  });

  /** @test {Bucket#addPermissions} */
  describe("#addPermissions()", () => {
    const fakePermissions = { read: [] as string[], write: [] as string[] };
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox.stub(client, "execute").returns(
        Promise.resolve({
          data: {},
          permissions: fakePermissions,
        })
      );
    });

    it("should append permissions", () => {
      getBlogBucket().addPermissions(fakePermissions);

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PATCH",
          path: "/buckets/blog",
          headers: {
            "Content-Type": "application/json-patch+json",
          },
          body: [],
        },
        { retry: 0 }
      );
    });

    it("should merge default options", () => {
      const bucket = getBlogBucket({ headers: { Foo: "Bar" }, safe: true });

      bucket.addPermissions(fakePermissions, { headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PATCH",
          path: "/buckets/blog",
          headers: {
            "Content-Type": "application/json-patch+json",
            Foo: "Bar",
            Baz: "Qux",
            "If-None-Match": "*",
          },
          body: [],
        },
        { retry: 0 }
      );
    });
  });

  /** @test {Bucket#removePermissions} */
  describe("#removePermissions()", () => {
    const fakePermissions = { read: [] as string[], write: [] as string[] };
    let executeStub: Stub<typeof client.execute>;

    beforeEach(() => {
      executeStub = sandbox.stub(client, "execute").returns(
        Promise.resolve({
          data: {},
          permissions: fakePermissions,
        })
      );
    });

    it("should pop permissions", () => {
      getBlogBucket().removePermissions(fakePermissions);

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PATCH",
          path: "/buckets/blog",
          headers: {
            "Content-Type": "application/json-patch+json",
          },
          body: [],
        },
        { retry: 0 }
      );
    });

    it("should merge default options", () => {
      const bucket = getBlogBucket({ headers: { Foo: "Bar" }, safe: true });

      bucket.removePermissions(fakePermissions, { headers: { Baz: "Qux" } });

      sinon.assert.calledWithMatch(
        executeStub,
        {
          method: "PATCH",
          path: "/buckets/blog",
          headers: {
            "Content-Type": "application/json-patch+json",
            Foo: "Bar",
            Baz: "Qux",
            "If-None-Match": "*",
          },
          body: [],
        },
        { retry: 0 }
      );
    });
  });

  /** @test {Bucket#batch} */
  describe("#batch()", () => {
    let batchStub: sinon.SinonStub;

    beforeEach(() => {
      batchStub = sandbox.stub();
      sandbox.stub(client, "batch").get(() => batchStub);
    });

    it("should batch operations for this bucket", () => {
      // @ts-ignore
      const fn = (batch: any) => {};

      getBlogBucket().batch(fn);

      sinon.assert.calledWith(batchStub, fn, {
        bucket: "blog",
        headers: {},
        retry: 0,
        safe: false,
        aggregate: false,
      });
    });

    it("should merge default options", () => {
      // @ts-ignore
      const fn = (batch: any) => {};

      getBlogBucket({
        headers: { Foo: "Bar" },
        safe: true,
      }).batch(fn, { headers: { Baz: "Qux" } });

      sinon.assert.calledWith(batchStub, fn, {
        bucket: "blog",
        headers: { Foo: "Bar", Baz: "Qux" },
        retry: 0,
        safe: true,
        aggregate: false,
      });
    });
  });

  /** @test {Bucket#execute} */
  describe("#execute()", () => {
    it("should rely on client execute", () => {
      const bucket = getBlogBucket();
      const executeStub = sandbox.stub();
      sandbox.stub(client, "execute").get(() => executeStub);
      const req = { path: "/", headers: {} };

      bucket.execute(req);

      sinon.assert.calledWith(executeStub, req);
    });
  });
});
