"use strict";

import { spawn } from "child_process";
import { v4 as uuid4 } from "uuid";
import btoa from "btoa";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import RemoteTransformer from "../src/transformers/remote";
import Kinto from "../src";
import { cleanRecord } from "../src/api";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_KINTO_SERVER = "http://0.0.0.0:8888/v1";
const PSERVE_EXECUTABLE = process.env.KINTO_PSERVE_EXECUTABLE || "pserve";
const KINTO_CONFIG = __dirname + "/kinto.ini";

describe("Integration tests", () => {
  var sandbox, server, tasks;
  const MAX_ATTEMPTS = 50;

  function startServer(env={}) {
    server = spawn(PSERVE_EXECUTABLE, [KINTO_CONFIG], {env});
    server.stderr.on("data", function(data) {
      // Uncomment the line below to have server logs printed.
      // process.stdout.write(data);
    });
  }

  function stopServer() {
    server.kill();
    return new Promise(resolve => {
      setTimeout(() => resolve(), 1000);
    });
  }

  function flushServer(attempt=1) {
    return fetch(`${TEST_KINTO_SERVER}/__flush__`, {method: "POST"})
      .then(res => {
        if ([202, 410].indexOf(res.status) === -1)
          throw new Error("Unable to flush test server.");
      })
      .catch(err => {
        // Prevent race condition where integration tests start while server
        // isn't running yet.
        if (/ECONNREFUSED/.test(err.message) && attempt < MAX_ATTEMPTS) {
          return new Promise(resolve => {
            setTimeout(_ => resolve(flushServer(attempt++)), 250);
          });
        }
        throw err;
      });
  }

  beforeEach(function() {
    this.timeout(12500);

    sandbox = sinon.sandbox.create();

    tasks = new Kinto({
      remote: TEST_KINTO_SERVER,
      headers: {Authorization: "Basic " + btoa("user:pass")}
    }).collection("tasks");

    return tasks.clear().then(_ => flushServer());
  });

  afterEach(() => sandbox.restore());

  function testSync(data) {
    return Promise.all([].concat(
      // Create local unsynced records
      data.localUnsynced.map(record => tasks.create(record, {forceUUID: true})),
      // Create local synced records
      data.localSynced.map(record => tasks.create(record, {synced: true})),
      // Create remote records
      tasks.api.batch("default", "tasks", data.server)
    )).then(_ => {
      return tasks.sync();
    });
  }

  describe("Default server configuration", () => {
    before(() => {
      return startServer();
    });

    after(() => {
      return stopServer();
    });

    describe("Settings", () => {
      it("should retrieve server settings", () => {
        return tasks.sync()
          .then(_ => tasks.api.serverSettings)
          .should.become({"cliquet.batch_max_requests": 25});
      });
    });

    describe("Synchronization", () => {
      describe("No conflict", () => {
        const testData = {
          localSynced: [
            {id: uuid4(), title: "task2", done: false},
            {id: uuid4(), title: "task3", done: true},
          ],
          localUnsynced: [
            {id: uuid4(), title: "task4", done: false},
          ],
          server: [
            {id: uuid4(), title: "task1", done: true},
          ]
        };
        var syncResult;

        beforeEach(() => {
          return testSync(testData).then(res => syncResult = res);
        });

        it("should have an ok status", () => {
          expect(syncResult.ok).eql(true);
        });

        it("should contain no errors", () => {
          expect(syncResult.errors).to.have.length.of(0);
        });

        it("should have a valid lastModified value", () => {
          expect(syncResult.lastModified).to.be.a("number");
        });

        it("should not contain conflicts", () => {
          expect(syncResult.conflicts).to.have.length.of(0);
        });

        it("should not have skipped records", () => {
          expect(syncResult.skipped).to.have.length.of(0);
        });

        it("should have imported server data", () => {
          expect(syncResult.created).to.have.length.of(1);
          expect(cleanRecord(syncResult.created[0])).eql(testData.server[0]);
        });

        it("should have published local unsynced records", () => {
          expect(syncResult.published).to.have.length.of(1);
          expect(cleanRecord(syncResult.published[0])).eql(testData.localUnsynced[0]);
        });

        it("should mark local records as synced", () => {
          expect(syncResult.updated).to.have.length.of(1);
          expect(syncResult.updated.map(r => cleanRecord(r))).to
            .include(testData.localUnsynced[0]);
        });
      });

      describe("Incoming conflict", () => {
        const conflictingId = uuid4();
        const testData = {
          localSynced: [
            {id: uuid4(), title: "task2", done: false},
            {id: uuid4(), title: "task3", done: true},
          ],
          localUnsynced: [
            {id: conflictingId, title: "task4-local", done: false},
          ],
          server: [
            {id: conflictingId, title: "task4-remote", done: true},
          ]
        };
        var syncResult;

        beforeEach(() => {
          return testSync(testData).then(res => syncResult = res);
        });

        it("should not have an ok status", () => {
          expect(syncResult.ok).eql(false);
        });

        it("should contain no errors", () => {
          expect(syncResult.errors).to.have.length.of(0);
        });

        it("should have a valid lastModified value", () => {
          expect(syncResult.lastModified).to.be.a("number");
        });

        it("should have the incoming conflict listed", () => {
          expect(syncResult.conflicts).to.have.length.of(1);
          expect(syncResult.conflicts[0].type).eql("incoming");
          expect(cleanRecord(syncResult.conflicts[0].local)).eql({
            id: conflictingId,
            title: "task4-local",
            done: false,
          });
          expect(cleanRecord(syncResult.conflicts[0].remote)).eql({
            id: conflictingId,
            title: "task4-remote",
            done: true,
          });
        });

        it("should not have skipped records", () => {
          expect(syncResult.skipped).to.have.length.of(0);
        });

        it("should not have imported anything", () => {
          expect(syncResult.created).to.have.length.of(0);
        });

        it("should not have published anything", () => {
          expect(syncResult.published).to.have.length.of(0);
        });

        it("should not have updated anything", () => {
          expect(syncResult.updated).to.have.length.of(0);
        });
      });

      describe("Outgoing conflict", () => {
        var syncResult;

        beforeEach(() => {
          return fetch(`${TEST_KINTO_SERVER}/buckets/default/collections/tasks/records`, {
            method: "POST",
            headers: {
              "Accept":        "application/json",
              "Content-Type":  "application/json",
              "Authorization": "Basic " + btoa("user:pass"),
            },
            body: JSON.stringify({data: {title: "foo"}})
          })
            .then(_ => tasks.sync())
            .then(res => {
              return tasks.update(Object.assign({}, res.created[0], {
                last_modified: undefined
              }));
            })
            .then(res => tasks.sync())
            .then(res => {
              syncResult = res;
            });
        });

        it("should not have an ok status", () => {
          expect(syncResult.ok).eql(false);
        });

        it("should contain no errors", () => {
          expect(syncResult.errors).to.have.length.of(0);
        });

        it("should have a valid lastModified value", () => {
          expect(syncResult.lastModified).to.be.a("number");
        });

        it("should have the outgoing conflict listed", () => {
          expect(syncResult.conflicts).to.have.length.of(1);
          expect(syncResult.conflicts[0].type).eql("outgoing");
          expect(syncResult.conflicts[0].local.title).eql("foo");
          expect(syncResult.conflicts[0].remote.title).eql("foo");
        });

        it("should not have skipped records", () => {
          expect(syncResult.skipped).to.have.length.of(0);
        });

        it("should not have imported anything", () => {
          expect(syncResult.created).to.have.length.of(0);
        });

        it("should not have published anything", () => {
          expect(syncResult.published).to.have.length.of(0);
        });

        it("should not have updated anything", () => {
          expect(syncResult.updated).to.have.length.of(0);
        });
      });

      describe("Batch request chunking", () => {
        var nbFixtures;

        function loadFixtures() {
          return tasks.api.fetchServerSettings()
            .then(serverSettings => {
              nbFixtures = serverSettings["cliquet.batch_max_requests"] + 10;
              var fixtures = [];
              for (let i=0; i<nbFixtures; i++) {
                fixtures.push({title: "title" + i, position: i});
              }
              return Promise.all(fixtures.map(f => tasks.create(f)));
            });
        }

        beforeEach(() => {
          return loadFixtures().then(_ => tasks.sync());
        });

        it("should create the expected number of records", () => {
          return tasks.list({order: "-position"}).then(res => {
            expect(res.data.length).eql(nbFixtures);
            expect(res.data[0].position).eql(nbFixtures - 1);
          });
        });
      });
    });

    describe("Transformers", () => {
      class QuestionMarkTransformer extends RemoteTransformer {
        encode(record) {
          return Object.assign({}, record, {title: record.title + "?"});
        }
        decode(record) {
          return Object.assign({}, record, {title: record.title.slice(0, -1)});
        }
      }

      class ExclamationMarkTransformer extends RemoteTransformer {
        encode(record) {
          return Object.assign({}, record, {title: record.title + "!"});
        }
        decode(record) {
          return Object.assign({}, record, {title: record.title.slice(0, -1)});
        }
      }

      beforeEach(() => {
        tasks.use(new ExclamationMarkTransformer());
        tasks.use(new QuestionMarkTransformer());

        return Promise.all([
          tasks.create({id: uuid4(), title: "abc"}),
          tasks.create({id: uuid4(), title: "def"}),
        ]);
      });

      it("should encode records when pushed to the server", () => {
        return tasks.sync()
          .then(res => res.published.map(x => x.title).sort())
          .should.become(["abc!?", "def!?"]);
      });

      it("should store encoded data remotely", () => {
        return tasks.sync()
          .then(_ => {
            return fetch(`${TEST_KINTO_SERVER}/buckets/default/collections/tasks/records`, {
              headers: {"Authorization": "Basic " + btoa("user:pass")}
            });
          })
          .then(res => res.json())
          .then(res => res.data.map(x => x.title).sort())
          .should.become(["abc!?", "def!?"]);
      });

      it("should keep local data decoded", () => {
        return tasks.sync()
          .then(_ => tasks.list())
          .then(res => res.data.map(x => x.title).sort())
          .should.become(["abc", "def"]);
      });
    });
  });

  describe("Backed off server", () => {
    before(() => {
      startServer({CLIQUET_BACKOFF: 10});
    });

    after(() => {
      return stopServer();
    });

    it("should reject sync when the server sends a Backoff header", () => {
      // Note: first call receive the Backoff header, second actually rejects.
      return tasks.sync().then(_ => tasks.sync())
        .should.be.rejectedWith(Error, /Server is backed off; retry in 10s/);
    });
  });

  describe("Deprecated protocol version", () => {
    describe("Soft EOL", () => {
      before(() => {
        const tomorrow = new Date(new Date().getTime() + 86400000).toJSON().slice(0, 10);
        startServer({
          CLIQUET_EOS: tomorrow,
          CLIQUET_EOS_URL: "http://www.perdu.com",
          CLIQUET_EOS_MESSAGE: "Boom",
        });
      });

      after(() => stopServer());

      beforeEach(() => sandbox.stub(console, "warn"));

      it("should warn when the server sends a deprecation Alert header", () => {
        return tasks.sync()
          .then(_ => {
            sinon.assert.calledWithExactly(console.warn, "Boom", "http://www.perdu.com");
          });
      });
    });

    describe("Hard EOL", () => {
      before(() => {
        const lastWeek = new Date(new Date().getTime() - (7 * 86400000)).toJSON().slice(0, 10);
        startServer({
          CLIQUET_EOS: lastWeek,
          CLIQUET_EOS_URL: "http://www.perdu.com",
          CLIQUET_EOS_MESSAGE: "Boom",
        });
      });

      after(() => stopServer());

      beforeEach(() => sandbox.stub(console, "warn"));

      it("should reject with a 410 Gone when hard EOL is received", () => {
        return tasks.sync()
          .should.be.rejectedWith(Error, /HTTP 410; Service deprecated/);
      });
    });
  });
});
