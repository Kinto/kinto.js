"use strict";

import { spawn } from "child_process";
import { default as uuid4 } from "uuid/v4";
import btoa from "btoa";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import KintoServer from "kinto-node-test-server";
import Kinto from "../src";
import { recordsEqual, ServerWasFlushedError } from "../src/collection";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_KINTO_SERVER = "http://0.0.0.0:8888/v1";

const appendTransformer = function(s) {
  return {
    encode(record) {
      return Promise.resolve({ ...record, title: (record.title || "") + s });
    },
    decode(record) {
      if (record.title) {
        let newTitle = record.title;
        if (record.title.slice(-s.length) === s) {
          newTitle = record.title.slice(0, -1);
        }
        return Promise.resolve({ ...record, title: newTitle });
      }
      return Promise.resolve(record);
    },
  };
};

/**
 * Verify that syncing again is a no-op.
 */
function futureSyncsOK(getCollection, getLastSyncResult) {
  describe("On next MANUAL sync", () => {
    let nextSyncResult;

    beforeEach(() => {
      return getCollection()
        .sync()
        .then(result => {
          nextSyncResult = result;
        });
    });

    it("should have an ok status", () => {
      expect(nextSyncResult.ok).eql(true);
    });

    it("should contain no errors", () => {
      expect(nextSyncResult.errors).to.have.length.of(0);
    });

    it("should have the same lastModified value", () => {
      expect(nextSyncResult.lastModified).eql(getLastSyncResult().lastModified);
    });

    it("should not contain conflicts anymore", () => {
      expect(nextSyncResult.conflicts).to.have.length.of(0);
    });

    it("should not skip anything", () => {
      expect(nextSyncResult.skipped).to.have.length.of(0);
    });

    it("should not import anything", () => {
      expect(nextSyncResult.created).to.have.length.of(0);
    });

    it("should not publish anything", () => {
      expect(nextSyncResult.published).to.have.length.of(0);
    });

    it("should not update anything", () => {
      expect(nextSyncResult.updated).to.have.length.of(0);
    });
  });
}

describe("Integration tests", function() {
  let sandbox, server, kinto, tasks, tasksTransformed;

  // Disabling test timeouts until pserve gets decent startup time.
  this.timeout(0);

  before(() => {
    let kintoConfigPath = __dirname + "/kinto.ini";
    if (process.env.SERVER && process.env.SERVER !== "master") {
      kintoConfigPath = `${__dirname}/kinto-${process.env.SERVER}.ini`;
    }
    server = new KintoServer(TEST_KINTO_SERVER, { kintoConfigPath });
  });

  after(() => {
    const logLines = server.logs.toString().split("\n");
    const serverDidCrash = logLines.some(l => l.includes("Traceback"));
    if (serverDidCrash) {
      // Server errors have been encountered, raise to break the build
      const trace = logLines.join("\n");
      throw new Error(
        `Kinto server crashed while running the test suite.\n\n${trace}`
      );
    }
    return server.killAll();
  });

  after(done => {
    // Ensure no pserve process remains after tests having been executed.
    spawn("killall", ["pserve"]).on("close", () => done());
  });

  beforeEach(function() {
    this.timeout(12500);

    sandbox = sinon.createSandbox();

    kinto = new Kinto({
      remote: TEST_KINTO_SERVER,
      headers: { Authorization: "Basic " + btoa("user:pass") },
    });
    tasks = kinto.collection("tasks");
    tasksTransformed = kinto.collection("tasks-transformer", {
      remoteTransformers: [appendTransformer("!")],
    });
  });

  afterEach(() => sandbox.restore());

  describe("Default server configuration", () => {
    before(() => server.start());

    after(() => server.stop());

    beforeEach(() => {
      return tasks
        .clear()
        .then(_ => tasksTransformed.clear())
        .then(_ => server.flush());
    });

    describe("Synchronization", () => {
      function testSync(data, options = {}) {
        return collectionTestSync(tasks, data, options);
      }

      function collectionTestSync(collection, data, options) {
        // Create remote records
        return collection.api
          .bucket("default")
          .collection(collection._name)
          .batch(
            batch => {
              data.localSynced.forEach(r => batch.createRecord(r));
            },
            { safe: true }
          )
          .then(_ => collection.sync(options))
          .then(_ => {
            return Promise.all(
              [].concat(
                // Create local unsynced records
                data.localUnsynced.map(record =>
                  collection.create(record, { useRecordId: true })
                ),
                // Create remote records
                collection.api
                  .bucket("default")
                  .collection(collection._name)
                  .batch(
                    batch => {
                      data.server.forEach(r => batch.createRecord(r));
                    },
                    { safe: true }
                  )
              )
            );
          })
          .then(_ => {
            return collection.sync(options);
          });
      }

      function getRemoteList(collection = "tasks") {
        return fetch(
          `${TEST_KINTO_SERVER}/buckets/default/collections/${collection}/records?_sort=title`,
          {
            headers: { Authorization: "Basic " + btoa("user:pass") },
          }
        )
          .then(res => res.json())
          .then(json =>
            json.data.map(record => ({
              title: record.title,
              done: record.done,
            }))
          );
      }

      describe("No change", () => {
        const testData = {
          localSynced: [],
          localUnsynced: [],
          server: [{ id: uuid4(), title: "task1", done: true }],
        };
        let syncResult1;
        let syncResult2;

        beforeEach(() => {
          // Sync twice.
          return testSync(testData)
            .then(res => {
              syncResult1 = res;
              return tasks.sync();
            })
            .then(res => (syncResult2 = res));
        });

        it("should have an ok status", () => {
          expect(syncResult2.ok).eql(true);
        });

        it("should not contain conflicts", () => {
          expect(syncResult2.conflicts).to.have.length.of(0);
        });

        it("should have same lastModified value", () => {
          expect(syncResult1.lastModified).to.eql(syncResult2.lastModified);
        });
      });

      describe("No conflict", () => {
        const testData = {
          localSynced: [
            { id: uuid4(), title: "task2", done: false },
            { id: uuid4(), title: "task3", done: true },
          ],
          localUnsynced: [{ id: uuid4(), title: "task4", done: false }],
          server: [{ id: uuid4(), title: "task1", done: true }],
        };
        let syncResult;

        beforeEach(() => {
          return testSync(testData).then(res => (syncResult = res));
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

        it("should not skip records", () => {
          expect(syncResult.skipped).to.have.length.of(0);
        });

        it("should import server data", () => {
          expect(syncResult.created).to.have.length.of(1);
          expect(syncResult.created[0])
            .to.have.property("title")
            .eql(testData.server[0].title);

          expect(syncResult.created[0])
            .to.have.property("done")
            .eql(testData.server[0].done);
        });

        it("should publish local unsynced records", () => {
          expect(syncResult.published).to.have.length.of(1);
          expect(
            recordsEqual(syncResult.published[0], testData.localUnsynced[0])
          ).eql(true);
        });

        it("should publish deletion of locally deleted records", () => {
          const locallyDeletedId = testData.localSynced[0].id;
          return tasks
            .delete(locallyDeletedId)
            .then(_ => tasks.sync())
            .then(_ => getRemoteList())
            .should.eventually.become([
              { title: "task1", done: true },
              { title: "task3", done: true },
              { title: "task4", done: false },
            ]);
        });

        it("should not update anything", () => {
          expect(syncResult.updated).to.have.length.of(0);
        });

        it("should put local database in the expected state", () => {
          return tasks
            .list({ order: "title" })
            .then(res =>
              res.data.map(record => ({
                title: record.title,
                done: record.done,
                _status: record._status,
              }))
            )
            .should.become([
              { title: "task1", _status: "synced", done: true },
              { title: "task2", _status: "synced", done: false },
              { title: "task3", _status: "synced", done: true },
              { title: "task4", _status: "synced", done: false },
            ]);
        });

        it("should put remote test server data in the expected state", () => {
          return getRemoteList().should.become([
            // task1, task2, task3 were prexisting.
            { title: "task1", done: true },
            { title: "task2", done: false },
            { title: "task3", done: true },
            { title: "task4", done: false }, // published via sync.
          ]);
        });

        it("should fetch every server page", () => {
          return collectionTestSync(tasks, {
            localUnsynced: [],
            localSynced: [],
            server: Array(10)
              .fill()
              .map((e, i) => ({ id: uuid4(), title: `task${i}`, done: true })),
          })
            .then(() => tasks.list())
            .then(res => res.data)
            .should.eventually.have.length(10 + 4);
        });

        futureSyncsOK(() => tasks, () => syncResult);
      });

      describe("Incoming conflict", () => {
        const conflictingId = uuid4();
        const testData = {
          localSynced: [
            { id: uuid4(), title: "task1", done: true },
            { id: uuid4(), title: "task2", done: false },
            { id: uuid4(), title: "task3", done: true },
          ],
          localUnsynced: [
            { id: conflictingId, title: "task4-local", done: false },
          ],
          server: [{ id: conflictingId, title: "task4-remote", done: true }],
        };
        let syncResult;

        describe("PULL_ONLY strategy (default)", () => {
          beforeEach(() => {
            return testSync(testData, {
              strategy: Kinto.syncStrategy.PULL_ONLY,
            }).then(res => (syncResult = res));
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

          it("should have no conflicts", () => {
            expect(syncResult.conflicts).to.have.length.of(0);
            expect(syncResult.resolved).to.have.length.of(0);
            expect(syncResult.published).to.have.length.of(0);
            expect(syncResult.updated).to.have.length.of(1);
            expect(
              recordsEqual(syncResult.updated[0].old, {
                id: conflictingId,
                title: "task4-local",
                done: false,
              })
            ).eql(true);
            expect(
              recordsEqual(syncResult.updated[0].new, {
                id: conflictingId,
                title: "task4-remote",
                done: true,
              })
            ).eql(true);
          });
        });

        describe("MANUAL strategy (default)", () => {
          beforeEach(() => {
            return testSync(testData).then(res => (syncResult = res));
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
            expect(
              recordsEqual(syncResult.conflicts[0].local, {
                id: conflictingId,
                title: "task4-local",
                done: false,
              })
            ).eql(true);
            expect(
              recordsEqual(syncResult.conflicts[0].remote, {
                id: conflictingId,
                title: "task4-remote",
                done: true,
              })
            ).eql(true);
          });

          it("should not skip records", () => {
            expect(syncResult.skipped).to.have.length.of(0);
          });

          it("should not import anything", () => {
            expect(syncResult.created).to.have.length.of(0);
          });

          it("should not publish anything", () => {
            expect(syncResult.published).to.have.length.of(0);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should not merge anything", () => {
            expect(syncResult.resolved).to.have.length.of(0);
          });

          it("should put local database in the expected state", () => {
            return tasks
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  done: record.done,
                  _status: record._status,
                }))
              )
              .should.become([
                { title: "task1", _status: "synced", done: true },
                { title: "task2", _status: "synced", done: false },
                { title: "task3", _status: "synced", done: true },
                // For MANUAL strategy, local conficting record is left intact
                { title: "task4-local", _status: "created", done: false },
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              // task1, task2, task3 were prexisting.
              { title: "task1", done: true },
              { title: "task2", done: false },
              { title: "task3", done: true },
              // Remote record should have been left intact.
              { title: "task4-remote", done: true },
            ]);
          });

          describe("On next MANUAL sync", () => {
            let nextSyncResult;

            beforeEach(() => {
              return tasks.sync().then(result => {
                nextSyncResult = result;
              });
            });

            it("should not have an ok status", () => {
              expect(nextSyncResult.ok).eql(false);
            });

            it("should contain no errors", () => {
              expect(nextSyncResult.errors).to.have.length.of(0);
            });

            it("should not have bumped the lastModified value", () => {
              expect(nextSyncResult.lastModified).eql(syncResult.lastModified);
            });

            it("should preserve unresolved conflicts", () => {
              expect(nextSyncResult.conflicts).to.have.length.of(1);
            });

            it("should not skip anything", () => {
              expect(nextSyncResult.skipped).to.have.length.of(0);
            });

            it("should not import anything", () => {
              expect(nextSyncResult.created).to.have.length.of(0);
            });

            it("should not publish anything", () => {
              expect(nextSyncResult.published).to.have.length.of(0);
            });

            it("should not update anything", () => {
              expect(nextSyncResult.updated).to.have.length.of(0);
            });
          });
        });

        describe("CLIENT_WINS strategy", () => {
          beforeEach(() => {
            return testSync(testData, {
              strategy: Kinto.syncStrategy.CLIENT_WINS,
            }).then(res => (syncResult = res));
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

          it("should have updated lastModified", () => {
            expect(tasks.lastModified).to.equal(syncResult.lastModified);
            expect(tasks.db.getLastModified()).eventually.equal(
              syncResult.lastModified
            );
          });

          it("should have no incoming conflict listed", () => {
            expect(syncResult.conflicts).to.have.length.of(0);
          });

          it("should not skip records", () => {
            expect(syncResult.skipped).to.have.length.of(0);
          });

          it("should not import anything", () => {
            expect(syncResult.created).to.have.length.of(0);
          });

          it("should publish resolved conflict using local version", () => {
            expect(syncResult.published).to.have.length.of(1);
            expect(
              recordsEqual(syncResult.published[0], {
                id: conflictingId,
                title: "task4-local",
                done: false,
              })
            ).eql(true);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should list resolved records", () => {
            expect(syncResult.resolved).to.have.length.of(1);
            expect(
              recordsEqual(syncResult.resolved[0].accepted, {
                id: conflictingId,
                title: "task4-local",
                done: false,
              })
            ).eql(true);
          });

          it("should put local database in the expected state", () => {
            return tasks
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  done: record.done,
                  _status: record._status,
                }))
              )
              .should.become([
                { title: "task1", _status: "synced", done: true },
                { title: "task2", _status: "synced", done: false },
                { title: "task3", _status: "synced", done: true },
                // For CLIENT_WINS strategy, local record is marked as synced
                { title: "task4-local", _status: "synced", done: false },
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              // local task4 should have been published to the server.
              { title: "task1", done: true },
              { title: "task2", done: false },
              { title: "task3", done: true },
              { title: "task4-local", done: false },
            ]);
          });

          futureSyncsOK(() => tasks, () => syncResult);
        });

        describe("CLIENT_WINS strategy with transformers", () => {
          beforeEach(() => {
            return collectionTestSync(tasksTransformed, testData, {
              strategy: Kinto.syncStrategy.CLIENT_WINS,
            }).then(res => (syncResult = res));
          });

          it("should publish resolved conflict using local version", () => {
            expect(syncResult.published).to.have.length.of(1);
            expect(
              recordsEqual(syncResult.published[0], {
                id: conflictingId,
                title: "task4-local",
                done: false,
              })
            ).eql(true);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should list resolved records", () => {
            expect(syncResult.resolved).to.have.length.of(1);
            expect(
              recordsEqual(syncResult.resolved[0].accepted, {
                id: conflictingId,
                title: "task4-local",
                done: false,
              })
            ).eql(true);
          });

          it("should put local database in the expected state", () => {
            return tasksTransformed
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  done: record.done,
                  _status: record._status,
                }))
              )
              .should.become([
                { title: "task1", _status: "synced", done: true },
                { title: "task2", _status: "synced", done: false },
                { title: "task3", _status: "synced", done: true },
                // For CLIENT_WINS strategy, local record is marked as synced
                { title: "task4-local", _status: "synced", done: false },
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList(tasksTransformed._name).should.become([
              // local task4 should have been published to the server.
              { title: "task1", done: true },
              { title: "task2", done: false },
              { title: "task3", done: true },
              { title: "task4-local!", done: false },
            ]);
          });
        });

        describe("SERVER_WINS strategy", () => {
          beforeEach(() => {
            return testSync(testData, {
              strategy: Kinto.syncStrategy.SERVER_WINS,
            }).then(res => (syncResult = res));
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

          it("should have updated lastModified", () => {
            expect(tasks.lastModified).to.equal(syncResult.lastModified);
            expect(tasks.db.getLastModified()).eventually.equal(
              syncResult.lastModified
            );
          });

          it("should have no incoming conflict listed", () => {
            expect(syncResult.conflicts).to.have.length.of(0);
          });

          it("should not skip records", () => {
            expect(syncResult.skipped).to.have.length.of(0);
          });

          it("should not import anything", () => {
            expect(syncResult.created).to.have.length.of(0);
          });

          it("should not publish resolved conflict using remote version", () => {
            expect(syncResult.published).to.have.length.of(0);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should list resolved records", () => {
            expect(syncResult.resolved).to.have.length.of(1);
            expect(
              recordsEqual(syncResult.resolved[0].accepted, {
                id: conflictingId,
                title: "task4-remote",
                done: true,
              })
            ).eql(true);
          });

          it("should put local database in the expected state", () => {
            return tasks
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  done: record.done,
                  _status: record._status,
                }))
              )
              .should.become([
                { title: "task1", _status: "synced", done: true },
                { title: "task2", _status: "synced", done: false },
                { title: "task3", _status: "synced", done: true },
                // For SERVER_WINS strategy, remote record is marked as synced
                { title: "task4-remote", _status: "synced", done: true },
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              { title: "task1", done: true },
              { title: "task2", done: false },
              { title: "task3", done: true },
              // remote task4 should have been published to the server.
              { title: "task4-remote", done: true },
            ]);
          });

          futureSyncsOK(() => tasks, () => syncResult);
        });

        describe("Resolving conflicts doesn't interfere with sync", () => {
          const conflictingId = uuid4();
          const testData = {
            localSynced: [
              { id: conflictingId, title: "conflicting task", done: false },
            ],
            localUnsynced: [],
            server: [],
          };
          let rawCollection;

          beforeEach(() => {
            rawCollection = tasks.api.bucket("default").collection("tasks");
            return testSync(testData);
          });

          it("should sync over resolved records", () => {
            return tasks
              .update(
                { id: conflictingId, title: "locally changed title" },
                { patch: true }
              )
              .then(({ data: newRecord }) => {
                expect(newRecord.last_modified).to.exist;
                // Change the record remotely to introduce a comment
                return rawCollection.updateRecord(
                  { id: conflictingId, title: "remotely changed title" },
                  { patch: true }
                );
              })
              .then(() => tasks.sync())
              .then(syncResult => {
                expect(syncResult.ok).eql(false);
                expect(syncResult.conflicts).to.have.length.of(1);
                // Always pick our version.
                // #resolve will copy the remote last_modified.
                return tasks.resolve(
                  syncResult.conflicts[0],
                  syncResult.conflicts[0].local
                );
              })
              .then(() => tasks.sync())
              .then(syncResult => {
                expect(syncResult.ok).eql(true);
                expect(syncResult.conflicts).to.have.length.of(0);
                expect(syncResult.updated).to.have.length.of(0);
                expect(syncResult.published).to.have.length.of(1);
              })
              .then(() => tasks.get(conflictingId))
              .then(({ data: record }) => {
                expect(record.title).eql("locally changed title");
                expect(record._status).eql("synced");
              });
          });

          it("should not skip other conflicts", () => {
            const conflictingId2 = uuid4();
            return tasks
              .create(
                { id: conflictingId2, title: "second title" },
                { useRecordId: true }
              )
              .then(() => tasks.sync())
              .then(() =>
                rawCollection.updateRecord(
                  { id: conflictingId, title: "remotely changed title" },
                  { patch: true }
                )
              )
              .then(() =>
                rawCollection.updateRecord(
                  { id: conflictingId2, title: "remotely changed title2" },
                  { patch: true }
                )
              )
              .then(() =>
                tasks.update(
                  { id: conflictingId, title: "locally changed title" },
                  { patch: true }
                )
              )
              .then(() =>
                tasks.update(
                  { id: conflictingId2, title: "local title2" },
                  { patch: true }
                )
              )
              .then(() => tasks.sync())
              .then(syncResult => {
                expect(syncResult.ok).eql(false);
                expect(syncResult.conflicts).to.have.length.of(2);
                // resolve just one conflict and ensure that the other
                // one continues preventing the sync, even though it
                // happened "after" the first conflict
                return tasks.resolve(
                  syncResult.conflicts[1],
                  syncResult.conflicts[1].local
                );
              })
              .then(() => tasks.sync())
              .then(syncResult => {
                expect(syncResult.ok).eql(false);
                expect(syncResult.conflicts).to.have.length.of(1);
                expect(syncResult.updated).to.have.length.of(0);
              });
          });
        });
      });

      describe("Outgoing conflicting local deletion", () => {
        describe("With remote update", () => {
          let id, conflicts;

          beforeEach(() => {
            return tasks
              .create({ title: "initial" })
              .then(({ data }) => {
                id = data.id;
                return tasks.sync();
              })
              .then(() => {
                return tasks.delete(id);
              })
              .then(() => {
                return tasks.api
                  .bucket("default")
                  .collection("tasks")
                  .updateRecord({ id, title: "server-updated" });
              })
              .then(() => {
                return tasks.sync();
              })
              .then(res => {
                conflicts = res.conflicts;
              });
          });

          it("should properly list the encountered conflict", () => {
            expect(conflicts).to.have.length.of(1);
          });

          it("should list the proper type of conflict", () => {
            expect(conflicts[0].type).eql("outgoing");
          });

          it("should have the expected conflicting local version", () => {
            expect(conflicts[0].local).eql({ id });
          });

          it("should have the expected conflicting remote version", () => {
            expect(conflicts[0].remote)
              .to.have.property("id")
              .eql(id);
            expect(conflicts[0].remote)
              .to.have.property("title")
              .eql("server-updated");
          });
        });

        describe("With remote deletion", () => {
          let id, result;

          beforeEach(() => {
            return tasks
              .create({ title: "initial" })
              .then(({ data }) => {
                id = data.id;
                return tasks.sync();
              })
              .then(() => {
                return tasks.delete(id);
              })
              .then(() => {
                return tasks.api
                  .bucket("default")
                  .collection("tasks")
                  .deleteRecord(id);
              })
              .then(() => {
                return tasks.sync();
              })
              .then(res => (result = res));
          });

          it("should properly list the encountered conflict", () => {
            expect(result.skipped).to.have.length.of(1);
          });

          it("should provide the record", () => {
            expect(result.skipped[0])
              .to.have.property("id")
              .eql(id);
          });
        });
      });

      describe("Outgoing conflict", () => {
        let syncResult;

        function setupConflict(collection) {
          let recordId;
          const record = { title: "task1-remote", done: true };
          // Ensure that the remote record looks like something that's
          // been transformed
          return collection
            ._encodeRecord("remote", record)
            .then(record => {
              return collection.api
                .bucket("default")
                .collection(collection._name)
                .createRecord(record);
            })
            .then(_ => collection.sync())
            .then(res => {
              recordId = res.created[0].id;
              return collection.delete(recordId, { virtual: false });
            })
            .then(_ =>
              collection.create(
                {
                  id: recordId,
                  title: "task1-local",
                  done: false,
                },
                { useRecordId: true }
              )
            );
        }

        beforeEach(() => {
          return setupConflict(tasks).then(() =>
            setupConflict(tasksTransformed)
          );
        });

        describe("MANUAL strategy (default)", () => {
          let oldLastModified;
          beforeEach(() => {
            oldLastModified = tasks.lastModified;
            return tasks.sync().then(res => {
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

          it("should not have updated lastModified", () => {
            // lastModified hasn't changed because we haven't synced
            // anything since lastModified
            expect(tasks.lastModified).to.equal(oldLastModified);
            expect(tasks.lastModified).to.equal(syncResult.lastModified);
            expect(tasks.db.getLastModified()).eventually.equal(
              syncResult.lastModified
            );
          });

          it("should have the outgoing conflict listed", () => {
            expect(syncResult.conflicts).to.have.length.of(1);
            expect(syncResult.conflicts[0].type).eql("outgoing");
            expect(syncResult.conflicts[0].local.title).eql("task1-local");
            expect(syncResult.conflicts[0].remote.title).eql("task1-remote");
          });

          it("should not skip records", () => {
            expect(syncResult.skipped).to.have.length.of(0);
          });

          it("should not import anything", () => {
            expect(syncResult.created).to.have.length.of(0);
          });

          it("should not publish anything", () => {
            expect(syncResult.published).to.have.length.of(0);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should not merge anything", () => {
            expect(syncResult.resolved).to.have.length.of(0);
          });

          it("should put local database in the expected state", () => {
            return tasks
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  _status: record._status,
                }))
              )
              .should.become([
                // For MANUAL strategy, local conficting record is left intact
                { title: "task1-local", _status: "created" },
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              // local version should have been published to the server.
              { title: "task1-remote", done: true },
            ]);
          });

          describe("On next MANUAL sync", () => {
            let nextSyncResult;

            beforeEach(() => {
              return tasks.sync().then(result => {
                nextSyncResult = result;
              });
            });

            it("should not have an ok status", () => {
              expect(nextSyncResult.ok).eql(false);
            });

            it("should contain no errors", () => {
              expect(nextSyncResult.errors).to.have.length.of(0);
            });

            it("should not have bumped the lastModified value", () => {
              expect(nextSyncResult.lastModified).eql(syncResult.lastModified);
            });

            it("should preserve unresolved conflicts", () => {
              expect(nextSyncResult.conflicts).to.have.length.of(1);
            });

            it("should not skip anything", () => {
              expect(nextSyncResult.skipped).to.have.length.of(0);
            });

            it("should not import anything", () => {
              expect(nextSyncResult.created).to.have.length.of(0);
            });

            it("should not publish anything", () => {
              expect(nextSyncResult.published).to.have.length.of(0);
            });

            it("should not update anything", () => {
              expect(nextSyncResult.updated).to.have.length.of(0);
            });
          });
        });

        describe("CLIENT_WINS strategy", () => {
          let oldLastModified;
          beforeEach(() => {
            oldLastModified = tasks.lastModified;
            return tasks
              .sync({ strategy: Kinto.syncStrategy.CLIENT_WINS })
              .then(res => {
                syncResult = res;
              });
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

          it("should have updated lastModified", () => {
            // At the end of the sync, we will have pushed our record
            // remotely, which won't have caused a conflict, which
            // will update the remote lastModified, and this is the
            // lastModified our collection will have.
            expect(tasks.lastModified).above(oldLastModified);
            expect(tasks.lastModified).to.equal(syncResult.lastModified);
            expect(tasks.db.getLastModified()).eventually.equal(
              syncResult.lastModified
            );
          });

          it("should have the outgoing conflict listed", () => {
            expect(syncResult.conflicts).to.have.length.of(0);
          });

          it("should not skip records", () => {
            expect(syncResult.skipped).to.have.length.of(0);
          });

          it("should not import anything", () => {
            expect(syncResult.created).to.have.length.of(0);
          });

          it("should publish resolved conflicts to the server", () => {
            expect(syncResult.published).to.have.length.of(1);
            expect(syncResult.published[0].title).eql("task1-local");
            expect(syncResult.published[0].done).eql(false);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should list resolved records", () => {
            expect(syncResult.resolved).to.have.length.of(1);
            expect(syncResult.resolved[0].accepted.title).eql("task1-local");
          });

          it("should put local database in the expected state", () => {
            return tasks
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  _status: record._status,
                }))
              )
              .should.become([
                // For CLIENT_WINS strategy, local version is marked as synced
                { title: "task1-local", _status: "synced" },
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              { title: "task1-local", done: false },
            ]);
          });

          futureSyncsOK(() => tasks, () => syncResult);
        });

        describe("CLIENT_WINS strategy with transformers", () => {
          beforeEach(() => {
            return tasksTransformed
              .sync({ strategy: Kinto.syncStrategy.CLIENT_WINS })
              .then(res => {
                syncResult = res;
              });
          });

          it("should put local database in the expected state", () => {
            return tasksTransformed
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  _status: record._status,
                }))
              )
              .should.become([
                // For CLIENT_WINS strategy, local version is marked as synced
                { title: "task1-local", _status: "synced" },
              ]);
          });

          it("should put the remote database in the expected state", () => {
            return getRemoteList(tasksTransformed._name).should.become([
              // local task4 should have been published to the server.
              { title: "task1-local!", done: false },
            ]);
          });
        });

        describe("SERVER_WINS strategy", () => {
          let oldLastModified;
          beforeEach(() => {
            oldLastModified = tasks.lastModified;
            return tasks
              .sync({ strategy: Kinto.syncStrategy.SERVER_WINS })
              .then(res => {
                syncResult = res;
              });
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

          it("should not have updated lastModified", () => {
            // Although we updated the last modified from the server,
            // the server's lastModified is the same as the one we
            // used to have, since the last modification that took
            // place was when we synced the record (before we forgot
            // about it).
            expect(tasks.lastModified).to.equal(oldLastModified);
            expect(tasks.lastModified).to.equal(syncResult.lastModified);
            expect(tasks.db.getLastModified()).eventually.equal(
              syncResult.lastModified
            );
          });

          it("should not have the outgoing conflict listed", () => {
            expect(syncResult.conflicts).to.have.length.of(0);
          });

          it("should not skip records", () => {
            expect(syncResult.skipped).to.have.length.of(0);
          });

          it("should not import anything", () => {
            expect(syncResult.created).to.have.length.of(0);
          });

          it("should not publish anything", () => {
            expect(syncResult.published).to.have.length.of(0);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should list resolved records", () => {
            expect(syncResult.resolved).to.have.length.of(1);
            expect(syncResult.resolved[0].accepted.title).eql("task1-remote");
          });

          it("should put local database in the expected state", () => {
            return tasks
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  _status: record._status,
                }))
              )
              .should.become([
                // For SERVER_WINS strategy, local version is marked as synced
                { title: "task1-remote", _status: "synced" },
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              { title: "task1-remote", done: true },
            ]);
          });

          futureSyncsOK(() => tasks, () => syncResult);
        });

        describe("SERVER_WINS strategy with transformers", () => {
          beforeEach(() => {
            return tasksTransformed
              .sync({ strategy: Kinto.syncStrategy.SERVER_WINS })
              .then(res => {
                syncResult = res;
              });
          });

          it("should not publish anything", () => {
            expect(syncResult.published).to.have.length.of(0);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should list resolved records", () => {
            expect(syncResult.resolved).to.have.length.of(1);
            expect(syncResult.resolved[0].accepted.title).eql("task1-remote");
          });

          it("should put local database in the expected state", () => {
            return tasksTransformed
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  _status: record._status,
                }))
              )
              .should.become([
                // For SERVER_WINS strategy, local version is marked as synced
                { title: "task1-remote", _status: "synced" },
              ]);
          });
        });
      });

      describe("Outgoing conflict (remote deleted)", () => {
        let syncResult;

        function setupConflict(collection) {
          let recordId;
          const record = { title: "task1-remote", done: true };
          // Ensure that the remote record looks like something that's
          // been transformed
          return collection
            ._encodeRecord("remote", record)
            .then(record => {
              return collection.api
                .bucket("default")
                .collection(collection._name)
                .createRecord(record);
            })
            .then(_ => collection.sync())
            .then(res => {
              recordId = res.created[0].id;
              return collection.api.deleteBucket("default");
            })
            .then(_ => {
              // Hack to make it seem like the delete happened "at the
              // same time" as our sync (pull won't see records, but
              // push will fail with conflict)
              return collection.api
                .bucket("default")
                .collection(collection._name)
                .listRecords();
            })
            .then(res => {
              const lastModified = parseInt(res.last_modified, 10);
              collection._lastModified = lastModified;
              return collection.db.saveLastModified(lastModified);
            })
            .then(_ =>
              collection.update(
                {
                  id: recordId,
                  title: "task1-local",
                  done: false,
                },
                { useRecordId: true }
              )
            );
        }

        beforeEach(() => {
          return setupConflict(tasks).then(() =>
            setupConflict(tasksTransformed)
          );
        });

        describe("MANUAL strategy (default)", () => {
          let oldLastModified;

          beforeEach(() => {
            oldLastModified = tasks.lastModified;
            return tasks.sync().then(res => {
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

          it("should not have updated lastModified", () => {
            // Nothing to update it to; we explicitly copied it from
            // the server before syncing.
            expect(tasks.lastModified).to.equal(oldLastModified);
            expect(tasks.db.getLastModified()).eventually.equal(
              oldLastModified
            );
            expect(tasks.lastModified).equal(syncResult.lastModified);
          });

          it("should have the outgoing conflict listed", () => {
            expect(syncResult.conflicts).to.have.length.of(1);
            expect(syncResult.conflicts[0].type).eql("outgoing");
            expect(syncResult.conflicts[0].local.title).eql("task1-local");
            expect(syncResult.conflicts[0].remote).eql(null);
          });

          it("should not skip records", () => {
            expect(syncResult.skipped).to.have.length.of(0);
          });

          it("should not import anything", () => {
            expect(syncResult.created).to.have.length.of(0);
          });

          it("should not publish anything", () => {
            expect(syncResult.published).to.have.length.of(0);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should not merge anything", () => {
            expect(syncResult.resolved).to.have.length.of(0);
          });

          it("should put local database in the expected state", () => {
            return tasks
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  _status: record._status,
                }))
              )
              .should.become([
                // For MANUAL strategy, local conficting record is left intact
                { title: "task1-local", _status: "updated" },
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([]);
          });

          describe("On next MANUAL sync", () => {
            let nextSyncResult;

            beforeEach(() => {
              return tasks.sync().then(result => {
                nextSyncResult = result;
              });
            });

            it("should not have an ok status", () => {
              expect(nextSyncResult.ok).eql(false);
            });

            it("should contain no errors", () => {
              expect(nextSyncResult.errors).to.have.length.of(0);
            });

            it("should not have bumped the lastModified value", () => {
              expect(nextSyncResult.lastModified).eql(syncResult.lastModified);
            });

            it("should preserve unresolved conflicts", () => {
              expect(nextSyncResult.conflicts).to.have.length.of(1);
            });

            it("should not skip anything", () => {
              expect(nextSyncResult.skipped).to.have.length.of(0);
            });

            it("should not import anything", () => {
              expect(nextSyncResult.created).to.have.length.of(0);
            });

            it("should not publish anything", () => {
              expect(nextSyncResult.published).to.have.length.of(0);
            });

            it("should not update anything", () => {
              expect(nextSyncResult.updated).to.have.length.of(0);
            });
          });
        });

        describe("CLIENT_WINS strategy", () => {
          beforeEach(() => {
            return tasks
              .sync({ strategy: Kinto.syncStrategy.CLIENT_WINS })
              .then(res => {
                syncResult = res;
              });
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

          it("should not have the outgoing conflict listed", () => {
            expect(syncResult.conflicts).to.have.length.of(0);
          });

          it("should not skip records", () => {
            expect(syncResult.skipped).to.have.length.of(0);
          });

          it("should not import anything", () => {
            expect(syncResult.created).to.have.length.of(0);
          });

          it("should publish resolved conflicts to the server", () => {
            expect(syncResult.published).to.have.length.of(1);
            expect(syncResult.published[0].title).eql("task1-local");
            expect(syncResult.published[0].done).eql(false);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should list resolved records", () => {
            expect(syncResult.resolved).to.have.length.of(1);
            expect(syncResult.resolved[0].rejected).eql(null);
            expect(syncResult.resolved[0].id).eql(
              syncResult.resolved[0].accepted.id
            );
            expect(syncResult.resolved[0].accepted.title).eql("task1-local");
          });

          it("should put local database in the expected state", () => {
            return tasks
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  _status: record._status,
                }))
              )
              .should.become([
                // For CLIENT_WINS strategy, local version is marked as synced
                { title: "task1-local", _status: "synced" },
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              { title: "task1-local", done: false },
            ]);
          });

          futureSyncsOK(() => tasks, () => syncResult);
        });

        describe("CLIENT_WINS strategy with transformers", () => {
          beforeEach(() => {
            return tasksTransformed
              .sync({ strategy: Kinto.syncStrategy.CLIENT_WINS })
              .then(res => {
                syncResult = res;
              });
          });

          it("should put local database in the expected state", () => {
            return tasksTransformed
              .list({ order: "title" })
              .then(res =>
                res.data.map(record => ({
                  title: record.title,
                  _status: record._status,
                }))
              )
              .should.become([
                // For CLIENT_WINS strategy, local version is marked as synced
                { title: "task1-local", _status: "synced" },
              ]);
          });

          it("should put the remote database in the expected state", () => {
            return getRemoteList(tasksTransformed._name).should.become([
              // local task4 should have been published to the server.
              { title: "task1-local!", done: false },
            ]);
          });
        });

        describe("SERVER_WINS strategy", () => {
          beforeEach(() => {
            return tasks
              .sync({ strategy: Kinto.syncStrategy.SERVER_WINS })
              .then(res => {
                syncResult = res;
              });
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

          it("should have the outgoing conflict listed", () => {
            expect(syncResult.conflicts).to.have.length.of(0);
          });

          it("should not skip records", () => {
            expect(syncResult.skipped).to.have.length.of(0);
          });

          it("should not import anything", () => {
            expect(syncResult.created).to.have.length.of(0);
          });

          it("should not publish anything", () => {
            expect(syncResult.published).to.have.length.of(0);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should list resolved records", () => {
            expect(syncResult.resolved).to.have.length.of(1);
            expect(syncResult.resolved[0].accepted).eql(null);
            expect(syncResult.resolved[0]).property("_status", "synced");
            expect(syncResult.resolved[0].rejected.title).eql("task1-local");
          });

          it("should put local database in the expected state", () => {
            return (
              tasks
                .list({ order: "title" })
                .then(res => res.data)
                // For SERVER_WINS strategy, local version is deleted
                .should.become([])
            );
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([]);
          });

          futureSyncsOK(() => tasks, () => syncResult);
        });

        describe("SERVER_WINS strategy with transformers", () => {
          beforeEach(() => {
            return tasksTransformed
              .sync({ strategy: Kinto.syncStrategy.SERVER_WINS })
              .then(res => {
                syncResult = res;
              });
          });

          it("should not publish anything", () => {
            expect(syncResult.published).to.have.length.of(0);
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should list resolved records", () => {
            expect(syncResult.resolved).to.have.length.of(1);
            expect(syncResult.resolved[0].id).eql(
              syncResult.resolved[0].rejected.id
            );
            expect(syncResult.resolved[0].rejected.title).eql("task1-local");
          });

          it("should put local database in the expected state", () => {
            return (
              tasksTransformed
                .list({ order: "title" })
                .then(res => res.data)
                // For SERVER_WINS strategy, local version is deleted
                .should.become([])
            );
          });
        });
      });

      describe("Load dump", () => {
        beforeEach(() => {
          const id1 = uuid4();
          const id2 = uuid4();
          const tasksRemote = tasks.api.bucket("default").collection("tasks");
          const dump = [
            { id: uuid4(), last_modified: 123456, title: "task1", done: false },
            { id: id1, last_modified: 123457, title: "task2", done: false },
            { id: id2, last_modified: 123458, title: "task3", done: false },
            { id: uuid4(), last_modified: 123459, title: "task4", done: false },
          ];
          return Promise.all(dump.map(r => tasksRemote.createRecord(r)))
            .then(() => tasks.importBulk(dump))
            .then(() =>
              tasksRemote.updateRecord({ id: id1, title: "task22", done: true })
            )
            .then(() =>
              tasksRemote.updateRecord({ id: id2, title: "task33", done: true })
            );
        });

        it("should sync changes on loaded data", () => {
          return tasks.sync().then(res => {
            expect(res.ok).eql(true);
            expect(res.updated.length).eql(2);
          });
        });
      });

      describe("Batch request chunking", () => {
        let nbFixtures;

        function loadFixtures() {
          return tasks.api.fetchServerSettings().then(serverSettings => {
            nbFixtures = serverSettings["batch_max_requests"] + 10;
            const fixtures = [];
            for (let i = 0; i < nbFixtures; i++) {
              fixtures.push({ title: "title" + i, position: i });
            }
            return Promise.all(fixtures.map(f => tasks.create(f)));
          });
        }

        beforeEach(() => {
          return loadFixtures().then(_ => tasks.sync());
        });

        it("should create the expected number of records", () => {
          return tasks.list({ order: "-position" }).then(res => {
            expect(res.data.length).eql(nbFixtures);
            expect(res.data[0].position).eql(nbFixtures - 1);
          });
        });
      });
    });

    describe("Schemas", () => {
      function createIntegerIdSchema() {
        let _next = 0;
        return {
          generate() {
            return _next++;
          },
          validate(id) {
            return id == parseInt(id, 10) && id >= 0;
          },
        };
      }

      describe("IdSchema", () => {
        beforeEach(() => {
          tasks = kinto.collection("tasks", {
            idSchema: createIntegerIdSchema(),
          });
        });

        it("should generate id's using the IdSchema", () => {
          return tasks
            .create({ foo: "bar" })
            .then(record => {
              return record.data.id;
            })
            .should.become(0);
        });
      });
    });

    describe("Transformers", () => {
      function createTransformer(char) {
        return {
          encode(record) {
            return { ...record, title: record.title + char };
          },
          decode(record) {
            return { ...record, title: record.title.slice(0, -1) };
          },
        };
      }

      beforeEach(() => {
        tasks = kinto.collection("tasks", {
          remoteTransformers: [createTransformer("!"), createTransformer("?")],
        });

        return Promise.all([
          tasks.create({ id: uuid4(), title: "abc" }, { useRecordId: true }),
          tasks.create({ id: uuid4(), title: "def" }, { useRecordId: true }),
        ]);
      });

      it("should list published records unencoded", () => {
        return tasks
          .sync()
          .then(res => res.published.map(x => x.title).sort())
          .should.become(["abc", "def"]);
      });

      it("should store encoded data remotely", () => {
        return tasks
          .sync()
          .then(_ => {
            return fetch(
              `${TEST_KINTO_SERVER}/buckets/default/collections/tasks/records`,
              {
                headers: { Authorization: "Basic " + btoa("user:pass") },
              }
            );
          })
          .then(res => res.json())
          .then(res => res.data.map(x => x.title).sort())
          .should.become(["abc!?", "def!?"]);
      });

      it("should keep local data decoded", () => {
        return tasks
          .sync()
          .then(_ => tasks.list())
          .then(res => res.data.map(x => x.title).sort())
          .should.become(["abc", "def"]);
      });
    });

    describe("Transforming local deletes", () => {
      function localDeleteTransformer() {
        // Turns local records that were deleted, but had
        // "preserve-on-send", into remote "updates".
        // Local records with "preserve-on-send" but weren't deleted
        // don't need to be "preserved", so ignore them.
        return {
          encode(record) {
            if (record._status == "deleted") {
              if (record.title.includes("preserve-on-send")) {
                if (record.last_modified) {
                  return { ...record, _status: "updated", wasDeleted: true };
                }
                return { ...record, _status: "created", wasDeleted: true };
              }
            }
            return record;
          },
          decode(record) {
            // Records that were deleted locally get pushed to the
            // server with `wasDeleted` so that we know they're
            // supposed to be deleted on the client.
            if (record.wasDeleted) {
              return { ...record, deleted: true };
            }
            return record;
          },
        };
      }

      let tasksRemote;
      const preserveOnSendNew = { id: uuid4(), title: "preserve-on-send new" };
      const preserveOnSendOld = {
        id: uuid4(),
        title: "preserve-on-send old",
        last_modified: 1234,
      };
      const deleteOnReceiveRemote = {
        id: uuid4(),
        title: "delete-on-receive",
        wasDeleted: true,
      };
      const deletedByOtherClientRemote = {
        id: uuid4(),
        title: "deleted-by-other-client",
      };
      beforeEach(() => {
        tasks = kinto.collection("tasks", {
          remoteTransformers: [localDeleteTransformer()],
        });
        tasksRemote = tasks.api.bucket("default").collection("tasks");
        return Promise.all([
          tasks.create(preserveOnSendNew, { useRecordId: true }),
          tasks.create(preserveOnSendOld, { useRecordId: true }),
          tasksRemote.createRecord(deletedByOtherClientRemote),
        ])
          .then(() => tasks.sync())
          .then(() => tasks.delete(preserveOnSendNew.id))
          .then(() => tasks.delete(preserveOnSendOld.id))
          .then(() => tasksRemote.createRecord(deleteOnReceiveRemote));
      });

      it("should have sent preserve-on-send new remotely", () => {
        return tasks
          .sync()
          .then(() => tasksRemote.getRecord(preserveOnSendNew.id))
          .then(res => res.data)
          .should.eventually.property("title", "preserve-on-send new");
      });

      it("should have sent preserve-on-send old remotely", () => {
        return tasks
          .sync()
          .then(() => tasksRemote.getRecord(preserveOnSendOld.id))
          .then(res => res.data)
          .should.eventually.property("title", "preserve-on-send old");
      });

      it("should have locally deleted preserve-on-send new", () => {
        return tasks
          .sync()
          .then(() => tasks.getAny(preserveOnSendNew.id))
          .then(res => res.data)
          .should.eventually.eql(undefined);
      });

      it("should have locally deleted preserve-on-send old", () => {
        return tasks
          .sync()
          .then(() => tasks.getAny(preserveOnSendOld.id))
          .then(res => res.data)
          .should.eventually.eql(undefined);
      });

      it("should have deleted delete-on-receive", () => {
        return tasks
          .sync()
          .then(() => tasks.getAny(deleteOnReceiveRemote.id))
          .then(res => res.data)
          .should.eventually.eql(undefined);
      });

      it("should have deleted deleted-by-other-client", () => {
        return tasks
          .getAny(deletedByOtherClientRemote.id)
          .then(res => expect(res.data.title).to.eql("deleted-by-other-client"))
          .then(() =>
            tasksRemote.createRecord({
              ...deletedByOtherClientRemote,
              wasDeleted: true,
            })
          )
          .then(() => tasks.sync())
          .then(() => tasks.getAny(deletedByOtherClientRemote.id))
          .then(res => res.data)
          .should.eventually.eql(undefined);
      });
    });
  });

  describe("Flushed server", function() {
    before(() => server.start());

    after(() => server.stop());

    beforeEach(() => {
      return tasks
        .clear()
        .then(_ => {
          return Promise.all([
            tasks.create({ name: "foo" }),
            tasks.create({ name: "bar" }),
          ]);
        })
        .then(_ => tasks.sync())
        .then(_ => server.flush());
    });

    it("should reject a call to sync() with appropriate message", () => {
      return tasks
        .sync()
        .should.be.rejectedWith(
          ServerWasFlushedError,
          /^Server has been flushed. Client Side Timestamp: \d+ Server Side Timestamp: \d+$/
        );
    });

    it("should allow republishing local collection to flushed server", () => {
      return tasks
        .sync()
        .catch(_ => tasks.resetSyncStatus())
        .then(_ => tasks.sync())
        .should.eventually.have.property("published")
        .to.have.length.of(2);
    });
  });

  describe("Backed off server", () => {
    before(() => server.start({ KINTO_BACKOFF: 10 }));

    after(() => server.stop());

    beforeEach(() => {
      return tasks.clear().then(_ => server.flush());
    });

    it("should reject sync when the server sends a Backoff header", () => {
      // Note: first call receive the Backoff header, second actually rejects.
      return tasks
        .sync()
        .then(_ => tasks.sync())
        .should.be.rejectedWith(
          Error,
          /Server is asking clients to back off; retry in 10s/
        );
    });
  });

  describe("Deprecated protocol version", () => {
    beforeEach(() => {
      return tasks.clear().then(_ => server.flush());
    });

    describe("Soft EOL", () => {
      before(() => {
        const tomorrow = new Date(new Date().getTime() + 86400000)
          .toJSON()
          .slice(0, 10);
        return server.start({
          KINTO_EOS: `"${tomorrow}"`,
          KINTO_EOS_URL: "http://www.perdu.com",
          KINTO_EOS_MESSAGE: "Boom",
        });
      });

      after(() => server.stop());

      beforeEach(() => sandbox.stub(console, "warn"));

      it("should warn when the server sends a deprecation Alert header", () => {
        return tasks.sync().then(_ => {
          sinon.assert.calledWithExactly(
            console.warn,
            "Boom",
            "http://www.perdu.com"
          );
        });
      });
    });

    describe("Hard EOL", () => {
      before(() => {
        const lastWeek = new Date(new Date().getTime() - 7 * 86400000)
          .toJSON()
          .slice(0, 10);
        return server.start({
          KINTO_EOS: `"${lastWeek}"`,
          KINTO_EOS_URL: "http://www.perdu.com",
          KINTO_EOS_MESSAGE: "Boom",
        });
      });

      after(() => server.stop());

      beforeEach(() => sandbox.stub(console, "warn"));

      it("should reject with a 410 Gone when hard EOL is received", () => {
        return tasks
          .sync()
          .should.be.rejectedWith(Error, /HTTP 410 Gone: Service deprecated/);
      });
    });
  });
});
