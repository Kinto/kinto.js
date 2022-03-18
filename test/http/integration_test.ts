import sinon from "sinon";

import Api from "../../src/http";
import KintoClientBase, { KintoClientOptions } from "../../src/http/base";
import { EventEmitter } from "events";
import KintoServer from "kinto-node-test-server";
import { delayedPromise, Stub, btoa, expectAsyncError } from "../test_utils";
import Bucket from "../../src/http/bucket";
import Collection from "../../src/http/collection";
import {
  PermissionData,
  OperationResponse,
  KintoObject,
  Attachment,
  KintoResponse,
  Group,
} from "../../src/types";
import { AggregateResponse } from "../../src/http/batch";

interface TitleRecord extends KintoObject {
  title: string;
}

const { expect } = intern.getPlugin("chai");
intern.getPlugin("chai").should();
const { describe, it, before, after, beforeEach, afterEach } =
  intern.getPlugin("interface.bdd");

const skipLocalServer = !!process.env.TEST_KINTO_SERVER;
const TEST_KINTO_SERVER =
  process.env.TEST_KINTO_SERVER || "http://0.0.0.0:8888/v1";
const KINTO_PROXY_SERVER = process.env.KINTO_PROXY_SERVER || TEST_KINTO_SERVER;

async function startServer(
  server: KintoServer,
  options: { [key: string]: string } = {}
) {
  if (!skipLocalServer) {
    await server.start(options);
  }
}

async function stopServer(server: KintoServer) {
  if (!skipLocalServer) {
    await server.stop();
  }
}

describe("HTTP Integration tests", function (__test) {
  let sandbox: sinon.SinonSandbox, server: KintoServer, api: Api;

  // Disabling test timeouts until pserve gets decent startup time.
  __test.timeout = 0;

  before(async () => {
    if (skipLocalServer) {
      return;
    }
    let kintoConfigPath = __dirname + "/kinto.ini";
    if (process.env.SERVER && process.env.SERVER !== "master") {
      kintoConfigPath = `${__dirname}/kinto-${process.env.SERVER}.ini`;
    }
    server = new KintoServer(KINTO_PROXY_SERVER, {
      maxAttempts: 200,
      kintoConfigPath,
    });
    await server.loadConfig(kintoConfigPath);
  });

  after(() => {
    if (skipLocalServer) {
      return;
    }
    const logLines = server.logs.toString().split("\n");
    const serverDidCrash = logLines.some((l) => l.startsWith("Traceback"));
    if (serverDidCrash) {
      // Server errors have been encountered, raise to break the build
      const trace = logLines.join("\n");
      throw new Error(
        `Kinto server crashed while running the test suite.\n\n${trace}`
      );
    }
    return server.killAll();
  });

  function createClient(options: Partial<KintoClientOptions> = {}) {
    return new Api(TEST_KINTO_SERVER, options);
  }

  beforeEach((__test) => {
    __test.timeout = 12500;

    sandbox = sinon.createSandbox();
    const events = new EventEmitter();
    api = createClient({
      events,
      headers: { Authorization: "Basic " + btoa("user:pass") },
    });
  });

  afterEach(() => sandbox.restore());

  describe("Default server configuration", () => {
    before(async () => {
      await startServer(server);
    });

    after(async () => {
      await stopServer(server);
    });

    beforeEach(async () => {
      await server.flush();
    });

    // XXX move this to batch tests
    describe("new batch", () => {
      it("should support root batch", async function () {
        await api.batch((batch: KintoClientBase) => {
          const bucket = batch.bucket("default");
          bucket.createCollection("posts");
          const coll = bucket.collection("posts");
          coll.createRecord({ a: 1 });
          coll.createRecord({ a: 2 });
        });
        const res = await api
          .bucket("default")
          .collection("posts")
          .listRecords();
        res.data.should.have.lengthOf(2);
      });

      it("should support bucket batch", async function () {
        await api.bucket("default").batch((batch) => {
          batch.createCollection("posts");
          const coll = batch.collection("posts");
          coll.createRecord({ a: 1 });
          coll.createRecord({ a: 2 });
        });
        const res = await api
          .bucket("default")
          .collection("posts")
          .listRecords();
        res.data.should.have.lengthOf(2);
      });
    });

    describe("Server properties", () => {
      it("should retrieve server settings", async () => {
        (await api.fetchServerSettings()).should.have
          .property("batch_max_requests")
          .eql(25);
      });

      it("should retrieve server capabilities", async () => {
        const capabilities = await api.fetchServerCapabilities();
        expect(capabilities).to.be.an("object");
        // Kinto protocol 1.4 exposes capability descriptions
        Object.keys(capabilities).forEach((capability) => {
          const capabilityObj = capabilities[capability];
          expect(capabilityObj).to.include.keys("url", "description");
        });
      });

      it("should retrieve user information", async () => {
        const user = await api.fetchUser();
        expect(user!.id).to.match(/^basicauth:/);
        expect(user!.bucket).to.have.lengthOf(36);
      });

      it("should retrieve current API version", async () => {
        (await api.fetchHTTPApiVersion()).should.match(/^\d\.\d+$/);
      });
    });

    describe("#createBucket", () => {
      let result: KintoResponse;

      describe("Default options", () => {
        describe("Autogenerated id", () => {
          beforeEach(async () => {
            const res = await api.createBucket(null);
            return (result = res as KintoResponse);
          });

          it("should create a bucket", () => {
            expect(result)
              .to.have.property("data")
              .to.have.property("id")
              .to.be.a("string");
          });
        });

        describe("Custom id", () => {
          beforeEach(async () => {
            const res = await api.createBucket("foo");
            return (result = res as KintoResponse);
          });

          it("should create a bucket with the passed id", () => {
            expect(result)
              .to.have.property("data")
              .to.have.property("id")
              .eql("foo");
          });

          it("should create a bucket having a list of write permissions", () => {
            expect(result)
              .to.have.property("permissions")
              .to.have.property("write")
              .to.be.a("array");
          });

          describe("data option", () => {
            it("should create bucket data", async () => {
              (await api.createBucket("foo", { data: { a: 1 } })).should.have
                .property("data")
                .to.have.property("a")
                .eql(1);
            });
          });

          describe("Safe option", () => {
            it("should not override existing bucket", async () => {
              await expectAsyncError(
                () => api.createBucket("foo", { safe: true }),
                /412 Precondition Failed/
              );
            });
          });
        });
      });

      describe("permissions option", () => {
        beforeEach(async () => {
          const res = await api.createBucket("foo", {
            permissions: { read: ["github:n1k0"] },
          });
          return (result = res as KintoResponse);
        });

        it("should create a bucket having a list of write permissions", () => {
          expect(result)
            .to.have.property("permissions")
            .to.have.property("read")
            .to.eql(["github:n1k0"]);
        });
      });
    });

    describe("#deleteBucket()", () => {
      let last_modified: number;

      beforeEach(async () => {
        const res = await api.createBucket("foo");
        return (last_modified = (res as KintoResponse).data.last_modified);
      });

      it("should delete a bucket", async () => {
        await api.deleteBucket("foo");
        const { data } = await api.listBuckets();
        data.map((bucket) => bucket.id).should.not.include("foo");
      });

      describe("Safe option", () => {
        it("should raise a conflict error when resource has changed", async () => {
          await expectAsyncError(
            () =>
              api.deleteBucket("foo", {
                last_modified: last_modified - 1000,
                safe: true,
              }),
            /412 Precondition Failed/
          );
        });
      });
    });

    describe("#deleteBuckets()", () => {
      beforeEach(() => {
        return api.batch((batch: KintoClientBase) => {
          batch.createBucket("b1");
          batch.createBucket("b2");
        });
      });

      it("should delete all buckets", async () => {
        await api.deleteBuckets();
        await delayedPromise(50);
        const { data } = await api.listBuckets();
        data.should.deep.equal([]);
      });
    });

    describe("#listPermissions", () => {
      // FIXME: this feature was introduced between 8.2 and 8.3, and
      // these tests run against master as well as an older Kinto
      // version (see .travis.yml). If we ever bump the older version
      // up to one where it also has bucket:create, we can clean this
      // up.
      const shouldHaveCreatePermission =
        // People developing don't always set SERVER. Let's assume
        // that means "master".
        !process.env.SERVER ||
        // "master" is greater than 8.3 but let's just be explicit here.
        process.env.SERVER == "master" ||
        process.env.SERVER > "8.3" ||
        (process.env.SERVER > "8.2" && process.env.SERVER.includes("dev"));
      describe("Single page of permissions", () => {
        beforeEach(() => {
          return api.batch((batch: KintoClientBase) => {
            batch.createBucket("b1");
            batch.bucket("b1").createCollection("c1");
          });
        });

        it("should retrieve the list of permissions", async () => {
          let { data } = await api.listPermissions();
          if (shouldHaveCreatePermission) {
            // One element is for the root element which has
            // `bucket:create` as well as `account:create`. Remove
            // it.
            const isBucketCreate = (p_1: PermissionData) =>
              p_1.permissions.includes("bucket:create");
            const bucketCreate = data.filter(isBucketCreate);
            expect(bucketCreate.length).eql(1);
            data = data.filter((p_2) => !isBucketCreate(p_2));
          }
          expect(data).to.have.lengthOf(2);
          expect(data.map((p_3) => p_3.id).sort()).eql(["b1", "c1"]);
        });
      });

      describe("Paginated list of permissions", () => {
        beforeEach(() => {
          return api.batch((batch: KintoClientBase) => {
            for (let i = 1; i <= 15; i++) {
              batch.createBucket("b" + i);
            }
          });
        });

        it("should retrieve the list of permissions", async () => {
          const results = await api.listPermissions({ pages: Infinity });
          let expectedRecords = 15;
          if (shouldHaveCreatePermission) {
            expectedRecords++;
          }
          expect(results.data).to.have.lengthOf(expectedRecords);
        });
      });
    });

    describe("#listBuckets", () => {
      beforeEach(() => {
        return api.batch((batch: KintoClientBase) => {
          batch.createBucket("b1", { data: { size: 24 } });
          batch.createBucket("b2", { data: { size: 13 } });
          batch.createBucket("b3", { data: { size: 38 } });
          batch.createBucket("b4", { data: { size: -4 } });
        });
      });

      it("should retrieve the list of buckets", async () => {
        const { data } = await api.listBuckets();
        data
          .map((bucket) => bucket.id)
          .sort()
          .should.deep.equal(["b1", "b2", "b3", "b4"]);
      });

      it("should order buckets by field", async () => {
        const { data } = await api.listBuckets({ sort: "-size" });
        data
          .map((bucket) => bucket.id)
          .should.deep.equal(["b3", "b1", "b2", "b4"]);
      });

      describe("Filtering", () => {
        it("should filter buckets", async () => {
          const { data } = await api.listBuckets({
            sort: "size",
            filters: { min_size: 20 },
          });
          data.map((bucket) => bucket.id).should.deep.equal(["b1", "b3"]);
        });

        it("should resolve with buckets last_modified value", async () => {
          (await api.listBuckets()).should.have
            .property("last_modified")
            .to.be.a("string");
        });

        it("should retrieve only buckets after provided timestamp", async () => {
          const timestamp = (await api.listBuckets()).last_modified!;
          await api.createBucket("b5");
          (await api.listBuckets({ since: timestamp })).should.have
            .property("data")
            .to.have.lengthOf(1);
        });
      });

      describe("Pagination", () => {
        it("should not paginate by default", async () => {
          const { data } = await api.listBuckets();
          data
            .map((bucket) => bucket.id)
            .should.deep.equal(["b4", "b3", "b2", "b1"]);
        });

        it("should paginate by chunks", async () => {
          const { data } = await api.listBuckets({ limit: 2 });
          data.map((bucket) => bucket.id).should.deep.equal(["b4", "b3"]);
        });

        it("should expose a hasNextPage boolean prop", async () => {
          (await api.listBuckets({ limit: 2 })).should.have
            .property("hasNextPage")
            .eql(true);
        });

        it("should provide a next method to load next page", async () => {
          const res = await api.listBuckets({ limit: 2 });
          const { data } = await res.next();
          data.map((bucket) => bucket.id).should.deep.equal(["b2", "b1"]);
        });
      });
    });

    describe("#createAccount", () => {
      it("should create an account", async () => {
        await api.createAccount("testuser", "testpw");
        const user = await createClient({
          headers: { Authorization: "Basic " + btoa("testuser:testpw") },
        }).fetchUser();
        expect(user!.id).equal("account:testuser");
      });
    });

    describe("#batch", () => {
      describe("No chunked requests", () => {
        it("should allow batching operations", async () => {
          await api.batch((batch: KintoClientBase) => {
            batch.createBucket("custom");
            const bucket = batch.bucket("custom");
            bucket.createCollection("blog");
            const coll = bucket.collection("blog");
            coll.createRecord({ title: "art1" });
            coll.createRecord({ title: "art2" });
          });

          const { data } = await api
            .bucket("custom")
            .collection("blog")
            .listRecords<TitleRecord>();
          data
            .map((record) => record.title)
            .should.deep.equal(["art2", "art1"]);
        });
      });

      describe("Chunked requests", () => {
        it("should allow batching by chunks", async () => {
          // Note: kinto server configuration has kinto.paginated_by set to 10.
          await api.batch((batch: KintoClientBase) => {
            batch.createBucket("custom");
            const bucket = batch.bucket("custom");
            bucket.createCollection("blog");
            const coll = bucket.collection("blog");
            for (let i = 1; i <= 27; i++) {
              coll.createRecord({ title: "art" + i });
            }
          });

          (
            await api.bucket("custom").collection("blog").listRecords()
          ).should.have
            .property("data")
            .to.have.lengthOf(10);
        });
      });

      describe("aggregate option", () => {
        describe("Succesful publication", () => {
          describe("No chunking", () => {
            let results: AggregateResponse;

            beforeEach(async () => {
              const _results = await api.batch(
                (batch: KintoClientBase) => {
                  batch.createBucket("custom");
                  const bucket = batch.bucket("custom");
                  bucket.createCollection("blog");
                  const coll = bucket.collection("blog");
                  coll.createRecord({ title: "art1" });
                  coll.createRecord({ title: "art2" });
                },
                { aggregate: true }
              );
              return (results = _results as AggregateResponse);
            });

            it("should return an aggregated result object", () => {
              expect(results).to.include.keys([
                "errors",
                "conflicts",
                "published",
                "skipped",
              ]);
            });

            it("should contain the list of succesful publications", () => {
              expect(
                results.published.map((body) => body.data)
              ).to.have.lengthOf(4);
            });
          });

          describe("Chunked response", () => {
            let results: AggregateResponse;

            beforeEach(async () => {
              const _results = await api
                .bucket("default")
                .collection("blog")
                .batch(
                  (batch) => {
                    for (let i = 1; i <= 26; i++) {
                      batch.createRecord({ title: "art" + i });
                    }
                  },
                  { aggregate: true }
                );
              return (results = _results as AggregateResponse);
            });

            it("should return an aggregated result object", () => {
              expect(results).to.include.keys([
                "errors",
                "conflicts",
                "published",
                "skipped",
              ]);
            });

            it("should contain the list of succesful publications", () => {
              expect(results.published).to.have.lengthOf(26);
            });
          });
        });
      });
    });
  });

  describe("Backed off server", () => {
    const backoffSeconds = 10;

    before(async () => {
      await startServer(server, { KINTO_BACKOFF: backoffSeconds.toString() });
    });

    after(async () => {
      await stopServer(server);
    });

    beforeEach(async () => {
      await server.flush();
    });

    it("should appropriately populate the backoff property", async () => {
      // Issuing a first api call to retrieve backoff information
      await api.listBuckets();
      return expect(Math.round(api.backoff / 1000)).eql(backoffSeconds);
    });
  });

  describe("Deprecated protocol version", () => {
    beforeEach(async () => {
      await server.flush();
    });

    describe("Soft EOL", () => {
      let consoleWarnStub: Stub<typeof console.warn>;

      before(() => {
        const tomorrow = new Date(new Date().getTime() + 86400000)
          .toJSON()
          .slice(0, 10);
        return startServer(server, {
          KINTO_EOS: `"${tomorrow}"`,
          KINTO_EOS_URL: "http://www.perdu.com",
          KINTO_EOS_MESSAGE: "Boom",
        });
      });

      after(async () => {
        await stopServer(server);
      });

      beforeEach(() => {
        consoleWarnStub = sandbox.stub(console, "warn");
      });

      it("should warn when the server sends a deprecation Alert header", async () => {
        await api.fetchServerSettings();
        sinon.assert.calledWithExactly(
          consoleWarnStub,
          "Boom",
          "http://www.perdu.com"
        );
      });
    });

    describe("Hard EOL", () => {
      before(() => {
        const lastWeek = new Date(new Date().getTime() - 7 * 86400000)
          .toJSON()
          .slice(0, 10);
        return startServer(server, {
          KINTO_EOS: `"${lastWeek}"`,
          KINTO_EOS_URL: "http://www.perdu.com",
          KINTO_EOS_MESSAGE: "Boom",
        });
      });

      after(() => stopServer(server));

      beforeEach(() => {
        sandbox.stub(console, "warn");
      });

      it("should reject with a 410 Gone when hard EOL is received", async () => {
        // As of Kinto 13.6.2, EOL responses don't contain CORS headers, so we
        // can only assert than an error is throw.
        await expectAsyncError(
          () => api.fetchServerSettings()
          // /HTTP 410 Gone: Service deprecated/,
          // ServerResponse
        );
      });
    });
  });

  describe("Limited pagination", () => {
    before(() => {
      return startServer(server, { KINTO_PAGINATE_BY: "1" });
    });

    after(() => stopServer(server));

    beforeEach(() => server.flush());

    describe("Limited configured server pagination", () => {
      let collection: Collection;

      beforeEach(() => {
        collection = api.bucket("default").collection("posts");
        return collection.batch((batch) => {
          batch.createRecord({ n: 1 });
          batch.createRecord({ n: 2 });
        });
      });

      it("should fetch one results page", async () => {
        const { data } = await collection.listRecords();
        data.map((record) => record.id).should.have.lengthOf(1);
      });

      it("should fetch all available pages", async () => {
        const { data } = await collection.listRecords({ pages: Infinity });
        data.map((record) => record.id).should.have.lengthOf(2);
      });
    });
  });

  describe("Chainable API", () => {
    before(() => startServer(server));

    after(() => stopServer(server));

    beforeEach(() => server.flush());

    describe(".bucket()", () => {
      let bucket: Bucket;

      beforeEach(async () => {
        bucket = api.bucket("custom");
        await api.createBucket("custom");
        return await bucket.batch((batch) => {
          batch.createCollection("c1", { data: { size: 24 } });
          batch.createCollection("c2", { data: { size: 13 } });
          batch.createCollection("c3", { data: { size: 38 } });
          batch.createCollection("c4", { data: { size: -4 } });
          batch.createGroup("g1", [], { data: { size: 24 } });
          batch.createGroup("g2", [], { data: { size: 13 } });
          batch.createGroup("g3", [], { data: { size: 38 } });
          batch.createGroup("g4", [], { data: { size: -4 } });
        });
      });

      describe(".getData()", () => {
        let result: KintoObject;

        beforeEach(async () => {
          const res = await bucket.getData<KintoObject>();
          return (result = res);
        });

        it("should retrieve the bucket identifier", () => {
          expect(result).to.have.property("id").eql("custom");
        });

        it("should retrieve bucket last_modified value", () => {
          expect(result).to.have.property("last_modified").to.be.gt(1);
        });
      });

      describe(".setData()", () => {
        beforeEach(() => {
          return bucket.setPermissions({ read: ["github:jon"] });
        });

        it("should post data to the bucket", async () => {
          const res = await bucket.setData({ a: 1 });
          expect((res as KintoResponse).data.a).eql(1);
          expect((res as KintoResponse).permissions.read).to.include(
            "github:jon"
          );
        });

        it("should patch existing data for the bucket", async () => {
          await bucket.setData({ a: 1 });
          const res = await bucket.setData({ b: 2 }, { patch: true });
          expect((res as KintoResponse).data.a).eql(1);
          expect((res as KintoResponse).data.b).eql(2);
          expect((res as KintoResponse).permissions.read).to.include(
            "github:jon"
          );
        });

        it("should post data to the default bucket", async () => {
          const { data } = await api.bucket("default").setData({ a: 1 });
          data.should.have.property("a").eql(1);
        });
      });

      describe(".getPermissions()", () => {
        it("should retrieve bucket permissions", async () => {
          (await bucket.getPermissions()).should.have
            .property("write")
            .to.have.lengthOf(1);
        });
      });

      describe(".setPermissions()", () => {
        beforeEach(() => {
          return bucket.setData({ a: 1 });
        });

        it("should set bucket permissions", async () => {
          const res = await bucket.setPermissions({ read: ["github:n1k0"] });
          expect((res as KintoResponse).data.a).eql(1);
          expect((res as KintoResponse).permissions.read).eql(["github:n1k0"]);
        });

        describe("Safe option", () => {
          it("should check for concurrency", async () => {
            await expectAsyncError(
              () =>
                bucket.setPermissions(
                  { read: ["github:n1k0"] },
                  { safe: true, last_modified: 1 }
                ),
              /412 Precondition Failed/
            );
          });
        });
      });

      describe(".addPermissions()", () => {
        beforeEach(async () => {
          await bucket.setPermissions({ read: ["github:n1k0"] });
          return await bucket.setData({ a: 1 });
        });

        it("should append bucket permissions", async () => {
          const res = await bucket.addPermissions({ read: ["accounts:gabi"] });
          expect((res as KintoResponse).data.a).eql(1);
          expect((res as KintoResponse).permissions.read!.sort()).eql([
            "accounts:gabi",
            "github:n1k0",
          ]);
        });
      });

      describe(".removePermissions()", () => {
        beforeEach(async () => {
          await bucket.setPermissions({ read: ["github:n1k0"] });
          return await bucket.setData({ a: 1 });
        });

        it("should pop bucket permissions", async () => {
          const res = await bucket.removePermissions({ read: ["github:n1k0"] });
          expect((res as KintoResponse).data.a).eql(1);
          expect((res as KintoResponse).permissions.read).eql(undefined);
        });
      });

      describe(".listHistory()", () => {
        it("should retrieve the list of history entries", async () => {
          const { data } = await bucket.listHistory();
          data
            .map((entry) => entry.target.data.id)
            .should.deep.equal([
              "g4",
              "g3",
              "g2",
              "g1",
              "c4",
              "c3",
              "c2",
              "c1",
              "custom",
            ]);
        });

        it("should order entries by field", async () => {
          const { data } = await bucket.listHistory({ sort: "last_modified" });
          data
            .map((entry) => entry.target.data.id)
            .should.deep.equal([
              "custom",
              "c1",
              "c2",
              "c3",
              "c4",
              "g1",
              "g2",
              "g3",
              "g4",
            ]);
        });

        describe("Filtering", () => {
          it("should filter entries by top-level attributes", async () => {
            const { data } = await bucket.listHistory({
              filters: { resource_name: "bucket" },
            });
            data
              .map((entry) => entry.target.data.id)
              .should.deep.equal(["custom"]);
          });

          it("should filter entries by target attributes", async () => {
            const { data } = await bucket.listHistory({
              filters: { "target.data.id": "custom" },
            });
            data
              .map((entry) => entry.target.data.id)
              .should.deep.equal(["custom"]);
          });

          it("should resolve with entries last_modified value", async () => {
            (await bucket.listHistory()).should.have
              .property("last_modified")
              .to.be.a("string");
          });

          it("should retrieve only entries after provided timestamp", async () => {
            const timestamp = (await bucket.listHistory()).last_modified!;
            await bucket.createCollection("c5");
            (await bucket.listHistory({ since: timestamp })).should.have
              .property("data")
              .to.have.lengthOf(1);
          });
        });

        describe("Pagination", () => {
          it("should not paginate by default", async () => {
            const { data } = await bucket.listHistory();
            data.map((entry) => entry.target.data.id).should.have.lengthOf(9);
          });

          it("should paginate by chunks", async () => {
            const { data } = await bucket.listHistory({ limit: 2 });
            data
              .map((entry) => entry.target.data.id)
              .should.deep.equal(["g4", "g3"]);
          });

          it("should provide a next method to load next page", async () => {
            const res = await bucket.listHistory({ limit: 2 });
            const { data } = await res.next();
            data
              .map((entry) => entry.target.data.id)
              .should.deep.equal(["g2", "g1"]);
          });
        });
      });

      describe(".listCollections()", () => {
        it("should retrieve the list of collections", async () => {
          const { data } = await bucket.listCollections();
          data
            .map((collection) => collection.id)
            .sort()
            .should.deep.equal(["c1", "c2", "c3", "c4"]);
        });

        it("should order collections by field", async () => {
          const { data } = await bucket.listCollections({ sort: "-size" });
          data
            .map((collection) => collection.id)
            .should.deep.equal(["c3", "c1", "c2", "c4"]);
        });

        it("should work in a batch", async () => {
          const res = (await api.batch((batch: KintoClientBase) => {
            batch.bucket("custom").listCollections();
          })) as unknown as OperationResponse<KintoObject[]>[];
          res[0].body.data
            .map((r) => r.id)
            .should.deep.equal(["c4", "c3", "c2", "c1"]);
        });

        describe("Filtering", () => {
          it("should filter collections", async () => {
            const { data } = await bucket.listCollections({
              sort: "size",
              filters: { min_size: 20 },
            });
            data
              .map((collection) => collection.id)
              .should.deep.equal(["c1", "c3"]);
          });

          it("should resolve with collections last_modified value", async () => {
            (await bucket.listCollections()).should.have
              .property("last_modified")
              .to.be.a("string");
          });

          it("should retrieve only collections after provided timestamp", async () => {
            const timestamp = (await bucket.listCollections()).last_modified!;
            await bucket.createCollection("c5");
            (await bucket.listCollections({ since: timestamp })).should.have
              .property("data")
              .to.have.lengthOf(1);
          });
        });

        describe("Pagination", () => {
          it("should not paginate by default", async () => {
            const { data } = await bucket.listCollections();
            data
              .map((collection) => collection.id)
              .should.deep.equal(["c4", "c3", "c2", "c1"]);
          });

          it("should paginate by chunks", async () => {
            const { data } = await bucket.listCollections({ limit: 2 });
            data
              .map((collection) => collection.id)
              .should.deep.equal(["c4", "c3"]);
          });

          it("should provide a next method to load next page", async () => {
            const res = await bucket.listCollections({ limit: 2 });
            const { data } = await res.next();
            data
              .map((collection) => collection.id)
              .should.deep.equal(["c2", "c1"]);
          });
        });
      });

      describe(".createCollection()", () => {
        it("should create a named collection", async () => {
          await bucket.createCollection("foo");
          const { data } = await bucket.listCollections();
          data.map((coll) => coll.id).should.include("foo");
        });

        it("should create an automatically named collection", async () => {
          const res = await bucket.createCollection();
          const generated = (res as KintoResponse).data.id;
          const { data } = await bucket.listCollections();
          return expect(data.some((x) => x.id === generated)).eql(true);
        });

        describe("Safe option", () => {
          it("should not override existing collection", async () => {
            await bucket.createCollection("posts");

            await expectAsyncError(
              () => bucket.createCollection("posts", { safe: true }),
              /412 Precondition Failed/
            );
          });
        });

        describe("Permissions option", () => {
          let result: KintoResponse;

          beforeEach(async () => {
            const res = await bucket.createCollection("posts", {
              permissions: {
                read: ["github:n1k0"],
              },
            });
            return (result = res as KintoResponse);
          });

          it("should create a collection having a list of write permissions", () => {
            expect(result)
              .to.have.property("permissions")
              .to.have.property("read")
              .to.eql(["github:n1k0"]);
          });
        });

        describe("Data option", () => {
          let result: KintoResponse;

          beforeEach(async () => {
            const res = await bucket.createCollection("posts", {
              data: { foo: "bar" },
            });
            return (result = res as KintoResponse);
          });

          it("should create a collection having the expected data attached", () => {
            expect(result)
              .to.have.property("data")
              .to.have.property("foo")
              .eql("bar");
          });
        });
      });

      describe(".deleteCollection()", () => {
        it("should delete a collection", async () => {
          await bucket.createCollection("foo");
          await bucket.deleteCollection("foo");
          const { data } = await bucket.listCollections();
          data.map((coll) => coll.id).should.not.include("foo");
        });

        describe("Safe option", () => {
          it("should check for concurrency", async () => {
            const res = await bucket.createCollection("posts");

            expectAsyncError(
              () =>
                bucket.deleteCollection("posts", {
                  safe: true,
                  last_modified: res.data.last_modified - 1000,
                }),
              /412 Precondition Failed/
            );
          });
        });
      });

      describe(".listGroups()", () => {
        it("should retrieve the list of groups", async () => {
          const { data } = await bucket.listGroups();
          data
            .map((group) => group.id)
            .sort()
            .should.deep.equal(["g1", "g2", "g3", "g4"]);
        });

        it("should order groups by field", async () => {
          const { data } = await bucket.listGroups({ sort: "-size" });
          data
            .map((group) => group.id)
            .should.deep.equal(["g3", "g1", "g2", "g4"]);
        });

        describe("Filtering", () => {
          it("should filter groups", async () => {
            const { data } = await bucket.listGroups({
              sort: "size",
              filters: { min_size: 20 },
            });
            data.map((group) => group.id).should.deep.equal(["g1", "g3"]);
          });

          it("should resolve with groups last_modified value", async () => {
            (await bucket.listGroups()).should.have
              .property("last_modified")
              .to.be.a("string");
          });

          it("should retrieve only groups after provided timestamp", async () => {
            const timestamp = (await bucket.listGroups()).last_modified!;
            await bucket.createGroup("g5", []);
            (await bucket.listGroups({ since: timestamp })).should.have
              .property("data")
              .to.have.lengthOf(1);
          });
        });

        describe("Pagination", () => {
          it("should not paginate by default", async () => {
            const { data } = await bucket.listGroups();
            data
              .map((group) => group.id)
              .should.deep.equal(["g4", "g3", "g2", "g1"]);
          });

          it("should paginate by chunks", async () => {
            const { data } = await bucket.listGroups({ limit: 2 });
            data.map((group) => group.id).should.deep.equal(["g4", "g3"]);
          });

          it("should provide a next method to load next page", async () => {
            const res = await bucket.listGroups({ limit: 2 });
            const { data } = await res.next();
            data.map((group) => group.id).should.deep.equal(["g2", "g1"]);
          });
        });
      });

      describe(".createGroup()", () => {
        it("should create a named group", async () => {
          await bucket.createGroup("foo");
          const { data } = await bucket.listGroups();
          data.map((group) => group.id).should.include("foo");
        });

        it("should create an automatically named group", async () => {
          const res = await bucket.createGroup();
          const generated = (res as KintoResponse<Group>).data.id;
          const { data } = await bucket.listGroups();
          return expect(data.some((x) => x.id === generated)).eql(true);
        });

        describe("Safe option", () => {
          it("should not override existing group", async () => {
            await bucket.createGroup("admins");

            await expectAsyncError(
              () => bucket.createGroup("admins", [], { safe: true }),
              /412 Precondition Failed/
            );
          });
        });

        describe("Permissions option", () => {
          let result: KintoResponse<Group>;

          beforeEach(async () => {
            const res = await bucket.createGroup(
              "admins",
              ["twitter:leplatrem"],
              {
                permissions: {
                  read: ["github:n1k0"],
                },
              }
            );
            return (result = res as KintoResponse<Group>);
          });

          it("should create a collection having a list of write permissions", () => {
            expect(result)
              .to.have.property("permissions")
              .to.have.property("read")
              .to.eql(["github:n1k0"]);
            expect(result.data.members).to.include("twitter:leplatrem");
          });
        });

        describe("Data option", () => {
          let result: KintoResponse<Group>;

          beforeEach(async () => {
            const res = await bucket.createGroup(
              "admins",
              ["twitter:leplatrem"],
              {
                data: { foo: "bar" },
              }
            );
            return (result = res as KintoResponse<Group>);
          });

          it("should create a collection having the expected data attached", () => {
            expect(result)
              .to.have.property("data")
              .to.have.property("foo")
              .eql("bar");
            expect(result.data.members).to.include("twitter:leplatrem");
          });
        });
      });

      describe(".getGroup()", () => {
        it("should get a group", async () => {
          await bucket.createGroup("foo");
          const res = await bucket.getGroup("foo");
          expect((res as KintoResponse<Group>).data.id).eql("foo");
          expect((res as KintoResponse<Group>).data.members).eql([]);
          expect(
            (res as KintoResponse<Group>).permissions.write
          ).to.have.lengthOf(1);
        });
      });

      describe(".updateGroup()", () => {
        it("should update a group", async () => {
          const res = await bucket.createGroup("foo");
          await bucket.updateGroup({ ...res.data, title: "mod" });
          const { data } = await bucket.listGroups();

          // type Group doesn't have a title property, so we create an
          // intersection type that does
          const firstGroup = data[0] as Group & { title: string };
          firstGroup.title.should.equal("mod");
        });

        it("should patch a group", async () => {
          const res = await bucket.createGroup("foo", ["github:me"], {
            data: { title: "foo", blah: 42 },
          });
          await bucket.updateGroup(
            { id: (res as KintoResponse<Group>).data.id, blah: 43 },
            { patch: true }
          );
          const { data } = await bucket.listGroups();
          expect(data[0].title).eql("foo");
          expect(data[0].members).eql(["github:me"]);
          expect(data[0].blah).eql(43);
        });

        describe("Safe option", () => {
          const id = "2dcd0e65-468c-4655-8015-30c8b3a1c8f8";

          it("should perform concurrency checks with last_modified", async () => {
            const { data } = await bucket.createGroup("foo");

            await expectAsyncError(
              () =>
                bucket.updateGroup(
                  {
                    id: data.id,
                    members: ["github:me"],
                    title: "foo",
                    last_modified: 1,
                  },
                  { safe: true }
                ),
              /412 Precondition Failed/
            );
          });

          it("should create a non-existent resource when safe is true", async () => {
            (
              await bucket.updateGroup({ id, members: ["all"] }, { safe: true })
            ).should.have
              .property("data")
              .to.have.property("members")
              .eql(["all"]);
          });

          it("should not override existing data with no last_modified", async () => {
            const { data } = await bucket.createGroup("foo");

            await expectAsyncError(
              () =>
                bucket.updateGroup(
                  { id: data.id, members: [], title: "foo" },
                  { safe: true }
                ),
              /412 Precondition Failed/
            );
          });
        });
      });

      describe(".deleteGroup()", () => {
        it("should delete a group", async () => {
          await bucket.createGroup("foo");
          await bucket.deleteGroup("foo");
          const { data } = await bucket.listGroups();
          data.map((coll) => coll.id).should.not.include("foo");
        });

        describe("Safe option", () => {
          it("should check for concurrency", async () => {
            const { data } = await bucket.createGroup("posts");

            await expectAsyncError(
              () =>
                bucket.deleteGroup("posts", {
                  safe: true,
                  last_modified: data.last_modified - 1000,
                }),
              /412 Precondition Failed/
            );
          });
        });
      });

      describe(".batch()", () => {
        it("should allow batching operations for current bucket", async () => {
          await bucket.batch((batch) => {
            batch.createCollection("comments");
            const coll = batch.collection("comments");
            coll.createRecord({ content: "plop" });
            coll.createRecord({ content: "yo" });
          });

          const { data } = await bucket.collection("comments").listRecords();
          data
            .map((comment) => comment.content)
            .sort()
            .should.deep.equal(["plop", "yo"]);
        });

        describe("Safe option", () => {
          it("should allow batching operations for current bucket", async () => {
            (
              await bucket.batch(
                (batch) => {
                  batch.createCollection("comments");
                  batch.createCollection("comments");
                },
                { safe: true, aggregate: true }
              )
            ).should.have
              .property("conflicts")
              .to.have.lengthOf(1);
          });
        });
      });
    });

    describe(".collection()", () => {
      function runSuite(label: string, collPromise: () => Promise<Collection>) {
        describe(label, () => {
          let coll: Collection;

          beforeEach(async () => {
            const _coll = await collPromise();
            return (coll = _coll);
          });

          describe(".getTotalRecords()", () => {
            it("should retrieve the initial total number of records", async () => {
              (await coll.getTotalRecords()).should.equal(0);
            });

            it("should retrieve the updated total number of records", async () => {
              await coll.batch((batch) => {
                batch.createRecord({ a: 1 });
                batch.createRecord({ a: 2 });
              });
              (await coll.getTotalRecords()).should.equal(2);
            });
          });

          describe(".getPermissions()", () => {
            it("should retrieve permissions", async () => {
              (await coll.getPermissions()).should.have
                .property("write")
                .to.have.lengthOf(1);
            });
          });

          describe(".setPermissions()", () => {
            beforeEach(() => {
              return coll.setData({ a: 1 });
            });

            it("should set typed permissions", async () => {
              const res = await coll.setPermissions({ read: ["github:n1k0"] });
              expect((res as KintoResponse).data.a).eql(1);
              expect((res as KintoResponse).permissions.read).eql([
                "github:n1k0",
              ]);
            });

            describe("Safe option", () => {
              it("should perform concurrency checks", async () => {
                await expectAsyncError(
                  () =>
                    coll.setPermissions(
                      { read: ["github:n1k0"] },
                      { safe: true, last_modified: 1 }
                    ),
                  /412 Precondition Failed/
                );
              });
            });
          });

          describe(".addPermissions()", () => {
            beforeEach(async () => {
              await coll.setPermissions({ read: ["github:n1k0"] });
              return await coll.setData({ a: 1 });
            });

            it("should append collection permissions", async () => {
              const res = await coll.addPermissions({
                read: ["accounts:gabi"],
              });
              expect((res as KintoResponse).data.a).eql(1);
              expect((res as KintoResponse).permissions.read!.sort()).eql([
                "accounts:gabi",
                "github:n1k0",
              ]);
            });
          });

          describe(".removePermissions()", () => {
            beforeEach(async () => {
              await coll.setPermissions({ read: ["github:n1k0"] });
              return await coll.setData({ a: 1 });
            });

            it("should pop collection permissions", async () => {
              const res = await coll.removePermissions({
                read: ["github:n1k0"],
              });
              expect((res as KintoResponse).data.a).eql(1);
              expect((res as KintoResponse).permissions.read).eql(undefined);
            });
          });

          describe(".getData()", () => {
            it("should retrieve collection data", async () => {
              await coll.setData({ signed: true });
              const data = (await coll.getData()) as { signed: boolean };
              data.should.have.property("signed").eql(true);
            });
          });

          describe(".setData()", () => {
            beforeEach(() => {
              return coll.setPermissions({ read: ["github:n1k0"] });
            });

            it("should set collection data", async () => {
              const res = await coll.setData({ signed: true });
              expect((res as KintoResponse).data.signed).eql(true);
              expect((res as KintoResponse).permissions.read).to.include(
                "github:n1k0"
              );
            });

            describe("Safe option", () => {
              it("should perform concurrency checks", async () => {
                await expectAsyncError(
                  () =>
                    coll.setData(
                      { signed: true },
                      { safe: true, last_modified: 1 }
                    ),
                  /412 Precondition Failed/
                );
              });
            });
          });

          describe(".createRecord()", () => {
            describe("No record id provided", () => {
              it("should create a record", async () => {
                (await coll.createRecord({ title: "foo" })).should.have
                  .property("data")
                  .to.have.property("title")
                  .eql("foo");
              });

              describe("Safe option", () => {
                it("should check for existing record", async () => {
                  const { data } = await coll.createRecord({ title: "foo" });

                  await expectAsyncError(
                    () =>
                      coll.createRecord(
                        { id: data.id, title: "foo" },
                        { safe: true }
                      ),
                    /412 Precondition Failed/
                  );
                });
              });
            });

            describe("Record id provided", () => {
              const record = {
                id: "37f727ed-c8c4-461b-80ac-de874992165c",
                title: "foo",
              };

              it("should create a record", async () => {
                (await coll.createRecord(record)).should.have
                  .property("data")
                  .to.have.property("title")
                  .eql("foo");
              });
            });
          });

          describe(".updateRecord()", () => {
            it("should update a record", async () => {
              const res = await coll.createRecord({ title: "foo" });
              await coll.updateRecord({ ...res.data, title: "mod" });
              const { data } = await coll.listRecords();
              // type KintoObject doesn't have a title property, so we create
              // an intersection type that does
              const record = data[0] as KintoObject & { title: string };
              record.title.should.equal("mod");
            });

            it("should patch a record", async () => {
              const res = await coll.createRecord({ title: "foo", blah: 42 });
              await coll.updateRecord(
                { id: (res as KintoResponse).data.id, blah: 43 },
                { patch: true }
              );
              const { data } = await coll.listRecords();
              expect(data[0].title).eql("foo");
              expect(data[0].blah).eql(43);
            });

            it("should create the record if it doesn't exist yet", async () => {
              const id = "2dcd0e65-468c-4655-8015-30c8b3a1c8f8";

              const { data } = await coll.updateRecord({ id, title: "blah" });
              (await coll.getRecord(data.id)).should.have
                .property("data")
                .to.have.property("title")
                .eql("blah");
            });

            describe("Safe option", () => {
              const id = "2dcd0e65-468c-4655-8015-30c8b3a1c8f8";

              it("should perform concurrency checks with last_modified", async () => {
                const { data } = await coll.createRecord({ title: "foo" });

                await expectAsyncError(
                  () =>
                    coll.updateRecord(
                      { id: data.id, title: "foo", last_modified: 1 },
                      { safe: true }
                    ),
                  /412 Precondition Failed/
                );
              });

              it("should create a non-existent resource when safe is true", async () => {
                (
                  await coll.updateRecord({ id, title: "foo" }, { safe: true })
                ).should.have
                  .property("data")
                  .to.have.property("title")
                  .eql("foo");
              });

              it("should not override existing data with no last_modified", async () => {
                const { data } = await coll.createRecord({ title: "foo" });

                await expectAsyncError(
                  () =>
                    coll.updateRecord(
                      { id: data.id, title: "foo" },
                      { safe: true }
                    ),
                  /412 Precondition Failed/
                );
              });
            });
          });

          describe(".deleteRecord()", () => {
            it("should delete a record", async () => {
              const { data } = await coll.createRecord({ title: "foo" });
              await coll.deleteRecord(data.id);
              (await coll.listRecords()).should.have
                .property("data")
                .deep.equals([]);
            });

            describe("Safe option", () => {
              it("should perform concurrency checks", async () => {
                const { data } = await coll.createRecord({ title: "foo" });

                await expectAsyncError(
                  () =>
                    coll.deleteRecord(data.id, {
                      last_modified: 1,
                      safe: true,
                    }),
                  /412 Precondition Failed/
                );
              });
            });
          });

          describe(".addAttachment()", () => {
            describe("With filename", () => {
              const input = "test";
              const dataURL =
                "data:text/plain;name=test.txt;base64," + btoa(input);

              let result: KintoResponse<{ attachment: Attachment }>;

              beforeEach(async () => {
                const res = await coll.addAttachment(
                  dataURL,
                  { foo: "bar" },
                  { permissions: { write: ["github:n1k0"] } }
                );
                return (result = res as KintoResponse<{
                  attachment: Attachment;
                }>);
              });

              it("should create a record with an attachment", () => {
                expect(result)
                  .to.have.property("data")
                  .to.have.property("attachment")
                  .to.have.property("size")
                  .eql(input.length);
              });

              it("should create a record with provided record data", () => {
                expect(result)
                  .to.have.property("data")
                  .to.have.property("foo")
                  .eql("bar");
              });

              it("should create a record with provided permissions", () => {
                expect(result)
                  .to.have.property("permissions")
                  .to.have.property("write")
                  .contains("github:n1k0");
              });
            });

            describe("Without filename", () => {
              const dataURL = "data:text/plain;base64," + btoa("blah");

              it("should default filename to 'untitled' if not specified", async () => {
                (await coll.addAttachment(dataURL)).should.have
                  .property("data")
                  .have.property("attachment")
                  .have.property("filename")
                  .eql("untitled");
              });

              it("should allow to specify safe in options", async () => {
                (
                  await coll.addAttachment(dataURL, undefined, { safe: true })
                ).should.to.have
                  .property("data")
                  .to.have.property("attachment")
                  .to.have.property("size")
                  .eql(4);
              });

              it("should allow to specify a filename in options", async () => {
                (
                  await coll.addAttachment(dataURL, undefined, {
                    filename: "MYFILE.DAT",
                  })
                ).should.have
                  .property("data")
                  .have.property("attachment")
                  .have.property("filename")
                  .eql("MYFILE.DAT");
              });
            });
          });

          describe(".removeAttachment()", () => {
            const input = "test";
            const dataURL =
              "data:text/plain;name=test.txt;base64," + btoa(input);

            let recordId: string;

            beforeEach(async () => {
              const res = await coll.addAttachment(dataURL);
              return (recordId = (
                res as KintoResponse<{
                  attachment: Attachment;
                }>
              ).data.id);
            });

            it("should remove an attachment from a record", async () => {
              await coll.removeAttachment(recordId);
              (await coll.getRecord(recordId)).should.have
                .property("data")
                .to.have.property("attachment")
                .eql(null);
            });
          });

          describe(".getRecord()", () => {
            it("should retrieve a record by its id", async () => {
              const { data } = await coll.createRecord({ title: "blah" });

              (await coll.getRecord(data.id)).should.have
                .property("data")
                .to.have.property("title")
                .eql("blah");
            });
          });

          describe(".listRecords()", () => {
            it("should list records", async () => {
              await coll.createRecord({ title: "foo" });

              const { data } = await coll.listRecords();
              data.map((record) => record.title).should.deep.equal(["foo"]);
            });

            it("should order records by field", async () => {
              await Promise.all(
                ["art3", "art1", "art2"].map((title) => {
                  return coll.createRecord({ title });
                })
              );

              const { data } = await coll.listRecords({ sort: "title" });
              data
                .map((record) => record.title)
                .should.deep.equal(["art1", "art2", "art3"]);
            });

            describe("Filtering", () => {
              beforeEach(() => {
                return coll.batch((batch) => {
                  batch.createRecord({ name: "paul", age: 28 });
                  batch.createRecord({ name: "jess", age: 54 });
                  batch.createRecord({ name: "john", age: 33 });
                  batch.createRecord({ name: "rené", age: 24 });
                });
              });

              it("should filter records", async () => {
                const { data } = await coll.listRecords({
                  sort: "age",
                  filters: { min_age: 30 },
                });
                data
                  .map((record) => record.name)
                  .should.deep.equal(["john", "jess"]);
              });

              it("should properly escape unicode filters", async () => {
                const { data } = await coll.listRecords({
                  filters: { name: "rené" },
                });
                data.map((record) => record.name).should.deep.equal(["rené"]);
              });

              it("should resolve with collection last_modified value", async () => {
                (await coll.listRecords()).should.have
                  .property("last_modified")
                  .to.be.a("string");
              });
            });

            describe("since", () => {
              let ts1: string, ts2: string;

              beforeEach(async () => {
                ts1 = (await coll.listRecords()).last_modified!;
                await coll.createRecord({ n: 1 });
                ts2 = (await coll.listRecords()).last_modified!;
                return await coll.createRecord({ n: 2 });
              });

              it("should retrieve all records modified since provided timestamp", async () => {
                (await coll.listRecords({ since: ts1 })).should.have
                  .property("data")
                  .to.have.lengthOf(2);
              });

              it("should only list changes made after the provided timestamp", async () => {
                (await coll.listRecords({ since: ts2 })).should.have
                  .property("data")
                  .to.have.lengthOf(1);
              });
            });

            describe("'at' retrieves a snapshot at a given timestamp", () => {
              let rec1: KintoObject, rec2: KintoObject, rec3: KintoObject;

              beforeEach(async () => {
                const resp = await coll.createRecord({ n: 1 });
                rec1 = (resp as KintoResponse).data;
                const res = await coll.createRecord({ n: 2 });
                rec2 = (res as KintoResponse).data;
                const res_1 = await coll.createRecord({ n: 3 });
                return (rec3 = (res_1 as KintoResponse).data);
              });

              it("should resolve with a regular list result object", async () => {
                const result = await coll.listRecords({
                  at: rec3.last_modified,
                });
                const expectedSnapshot = [rec3, rec2, rec1];
                expect(result.data).to.eql(expectedSnapshot);
                expect(result.last_modified).eql(String(rec3.last_modified));
                expect(result.hasNextPage).eql(false);
                expect(result.totalRecords).eql(expectedSnapshot.length);
                expect(() => result.next()).to.Throw(Error, /pagination/);
              });

              it("should handle creations", async () => {
                (await coll.listRecords({ at: rec1.last_modified })).should.have
                  .property("data")
                  .eql([rec1]);
              });

              it("should handle updates", async () => {
                const res = await coll.updateRecord({ ...rec2, n: 42 });
                const updatedRec2 = (res as KintoResponse).data;
                const { data } = await coll.listRecords({
                  at: updatedRec2.last_modified,
                });
                expect(data).eql([updatedRec2, rec3, rec1]);
              });

              it("should handle deletions", async () => {
                const res = await coll.deleteRecord(rec1.id);
                const { data } = await coll.listRecords({
                  at: (res as KintoResponse).data.last_modified,
                });
                expect(data).eql([rec3, rec2]);
              });

              it("should handle re-creations", async () => {
                await coll.deleteRecord(rec1.id);
                await coll.createRecord({ id: rec1.id, n: 1 });
                const { data } = await coll.listRecords({
                  at: rec3.last_modified,
                });
                expect(data).eql([rec3, rec2, rec1]);
              });

              it("should handle plural delete before timestamp", async () => {
                await coll.createRecord({ n: 3 });
                await coll.deleteRecords({
                  filters: {
                    eq_n: 3,
                  },
                });
                const { data: rec4 } = await coll.createRecord({ n: 4 });
                const { data } = await coll.listRecords({
                  at: rec4.last_modified,
                });
                expect(data).eql([rec4, rec2, rec1]);
              });

              it("should handle plural delete after timestamp", async () => {
                const { data: rec33 } = await coll.createRecord({ n: 3 });
                await coll.createRecord({ n: 4 });
                await coll.deleteRecords({
                  filters: {
                    eq_n: 3,
                  },
                });
                const { data } = await coll.listRecords({
                  at: rec33.last_modified,
                });
                expect(data).eql([rec33, rec3, rec2, rec1]);
              });

              it("should handle long list of changes", async () => {
                const res = await coll.batch((batch) => {
                  for (let n = 4; n <= 100; n++) {
                    batch.createRecord({ n });
                  }
                });
                const at = (res as OperationResponse[])[50].body.data
                  .last_modified;
                (await coll.listRecords({ at })).should.have
                  .property("data")
                  .to.lengthOf(54);
              });

              describe("Mixed CRUD operations", () => {
                let rec4: KintoObject;
                let s1: KintoObject[] = [],
                  s2: KintoObject[] = [],
                  s3: KintoObject[] = [],
                  s4: KintoObject[] = [];
                let rec1up: KintoObject;

                beforeEach(async () => {
                  const responses = await coll.batch((batch) => {
                    batch.deleteRecord(rec2.id);
                    batch.updateRecord({
                      ...rec1,
                      foo: "bar",
                    });
                    batch.createRecord({ n: 4 });
                  });
                  rec1up = (responses as OperationResponse[])[1].body.data;
                  rec4 = (responses as OperationResponse[])[
                    (responses as OperationResponse[]).length - 1
                  ].body.data;
                  const results = await Promise.all([
                    coll.listRecords({ at: rec1.last_modified }),
                    coll.listRecords({ at: rec2.last_modified }),
                    coll.listRecords({ at: rec3.last_modified }),
                    coll.listRecords({ at: rec4.last_modified }),
                  ]);
                  const snapshots = results.map(({ data }) => data);
                  s1 = snapshots[0];
                  s2 = snapshots[1];
                  s3 = snapshots[2];
                  s4 = snapshots[3];
                });

                it("should compute snapshot1 as expected", () => {
                  expect(s1).eql([rec1]);
                });

                it("should compute snapshot2 as expected", () => {
                  expect(s2).eql([rec2, rec1]);
                });

                it("should compute snapshot3 as expected", () => {
                  expect(s3).eql([rec3, rec2, rec1]);
                });

                it("should compute snapshot4 as expected", () => {
                  expect(s4).eql([rec4, rec1up, rec3]);
                });
              });
            });

            describe("Pagination", () => {
              beforeEach(() => {
                return coll.batch((batch) => {
                  for (let i = 1; i <= 3; i++) {
                    batch.createRecord({ n: i });
                  }
                });
              });

              it("should not paginate by default", async () => {
                const { data } = await coll.listRecords();
                data.map((record) => record.n).should.deep.equal([3, 2, 1]);
              });

              it("should paginate by chunks", async () => {
                const { data } = await coll.listRecords({ limit: 2 });
                data.map((record) => record.n).should.deep.equal([3, 2]);
              });

              it("should provide a next method to load next page", async () => {
                const res = await coll.listRecords({ limit: 2 });
                const { data } = await res.next();
                data.map((record) => record.n).should.deep.equal([1]);
              });

              it("should resolve with an empty array on exhausted pagination", async () => {
                const res1 = await coll.listRecords({ limit: 2 });
                const res2 = await res1.next();

                await expectAsyncError(
                  () => res2.next(),
                  /Pagination exhausted./
                );
              });

              it("should retrieve all pages", async () => {
                // Note: Server has no limit by default, so here we get all the
                // records.
                const { data } = await coll.listRecords();
                data.map((record) => record.n).should.deep.equal([3, 2, 1]);
              });

              it("should retrieve specified number of pages", async () => {
                const { data } = await coll.listRecords({ limit: 1, pages: 2 });
                data.map((record) => record.n).should.deep.equal([3, 2]);
              });

              it("should allow fetching next page after last page if any", async () => {
                const { next } = await coll.listRecords({ limit: 1, pages: 1 });
                const { data } = await next();
                data.map((record) => record.n).should.deep.equal([3, 2]);
              });

              it("should should retrieve all existing pages", async () => {
                const { data } = await coll.listRecords({
                  limit: 1,
                  pages: Infinity,
                });
                data.map((record) => record.n).should.deep.equal([3, 2, 1]);
              });
            });
          });

          describe(".batch()", () => {
            it("should allow batching operations in the current collection", async () => {
              await coll.batch((batch) => {
                batch.createRecord({ title: "a" });
                batch.createRecord({ title: "b" });
              });
              const { data } = await coll.listRecords({ sort: "title" });
              data.map((record) => record.title).should.deep.equal(["a", "b"]);
            });
          });
        });
      }

      runSuite("default bucket", async () => {
        await api.bucket("default").createCollection("plop");
        return api.bucket("default").collection("plop");
      });

      runSuite("custom bucket", async () => {
        await api.createBucket("custom");
        await api.bucket("custom").createCollection("plop");
        return api.bucket("custom").collection("plop");
      });
    });
  });
});
