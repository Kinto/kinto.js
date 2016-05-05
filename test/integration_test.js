"use strict";

import { spawn } from "child_process";
import { v4 as uuid4 } from "uuid";
import btoa from "btoa";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import KintoServer from "kinto-node-test-server";
import Kinto from "../src";
import { cleanRecord } from "../src/collection";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_KINTO_SERVER = "http://0.0.0.0:8888/v1";


describe("Integration tests", function() {
  let sandbox, server, kinto, tasks;

  // Disabling test timeouts until pserve gets decent startup time.
  this.timeout(0);

  before(() => {
    server = new KintoServer(TEST_KINTO_SERVER, {
      kintoConfigPath: __dirname + "/kinto.ini"
    });
  });

  after(() => server.killAll());

  after((done) => {
    // Ensure no pserve process remains after tests having been executed.
    spawn("killall", ["pserve"]).on("close", () => done());
  });

  beforeEach(function() {
    this.timeout(12500);

    sandbox = sinon.sandbox.create();

    kinto = new Kinto({
      remote: TEST_KINTO_SERVER,
      headers: {Authorization: "Basic " + btoa("user:pass")}
    });
    tasks = kinto.collection("tasks");
  });

  afterEach(() => sandbox.restore());

  describe("Default server configuration", () => {
    before(() => server.start());

    after(() => server.stop());

    beforeEach(() => {
      return tasks.clear().then(_ => server.flush());
    });

    describe("Synchronization", () => {
      function testSync(data, options={}) {
        return Promise.all([].concat(
          // Create local unsynced records
          data.localUnsynced.map(record => tasks.create(record, {useRecordId: true})),
          // Create local synced records
          data.localSynced.map(record => tasks.create(record, {synced: true})),
          // Create remote records
          tasks.api.bucket("default").collection("tasks").batch((batch) => {
            data.server.forEach((r) => batch.createRecord(r));
            data.localSynced.forEach((r) => batch.createRecord(r));
          }, {safe: true})
        )).then(_ => {
          return tasks.sync(options);
        });
      }

      function getRemoteList() {
        return fetch(`${TEST_KINTO_SERVER}/buckets/default/collections/tasks/records?_sort=title`, {
          headers: {"Authorization": "Basic " + btoa("user:pass")}
        })
          .then(res => res.json())
          .then(json => json.data.map(record => ({
            title: record.title,
            done: record.done,
          })));
      }

      describe("No change", () => {
        const testData = {
          localSynced: [],
          localUnsynced: [],
          server: [
            {id: uuid4(), title: "task1", done: true},
          ]
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
            .then(res => syncResult2 = res);
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
        let syncResult;

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
          expect(cleanRecord(syncResult.published[0]))
            .to.have.property("done")
            .eql(testData.localUnsynced[0].done);

          expect(cleanRecord(syncResult.published[0]))
            .to.have.property("title")
            .eql(testData.localUnsynced[0].title);
        });

        it("should publish deletion of locally deleted records", () => {
          const locallyDeletedId = testData.localSynced[0].id;
          return tasks.delete(locallyDeletedId)
            .then(_ => tasks.sync())
            .then(_ => getRemoteList())
            .should.eventually.become([
              {title: "task1", done: true},
              {title: "task3", done: true},
              {title: "task4", done: false}
            ]);
        });

        it("should not update anything", () => {
          expect(syncResult.updated).to.have.length.of(0);
        });

        it("should put local database in the expected state", () => {
          return tasks.list({order: "title"})
            .then(res => res.data.map(record => ({
              title: record.title,
              done: record.done,
              _status: record._status,
            })))
            .should.become([
              {title: "task1", _status: "synced", done: true},
              {title: "task2", _status: "synced", done: false},
              {title: "task3", _status: "synced", done: true},
              {title: "task4", _status: "synced", done: false},
            ]);
        });

        it("should put remote test server data in the expected state", () => {
          return getRemoteList().should.become([
            // task1, task2, task3 were prexisting.
            {title: "task1", done: true},
            {title: "task2", done: false},
            {title: "task3", done: true},
            {title: "task4", done: false},  // published via sync.
          ]);
        });

        describe("On next MANUAL sync", () => {
          let nextSyncResult;

          beforeEach(() => {
            return tasks.sync().then(result => {
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
            expect(nextSyncResult.lastModified).eql(syncResult.lastModified);
          });

          it("should not contain conflicts", () => {
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
      });

      describe("Incoming conflict", () => {
        const conflictingId = uuid4();
        const testData = {
          localSynced: [
            {id: uuid4(), title: "task1", done: true},
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
        let syncResult;

        describe("MANUAL strategy (default)", () => {
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
            return tasks.list({order: "title"})
              .then(res => res.data.map(record => ({
                title: record.title,
                done: record.done,
                _status: record._status,
              })))
              .should.become([
                {title: "task1", _status: "synced", done: true},
                {title: "task2", _status: "synced", done: false},
                {title: "task3", _status: "synced", done: true},
                // For MANUAL strategy, local conficting record is left intact
                {title: "task4-local", _status: "created", done: false},
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              // task1, task2, task3 were prexisting.
              {title: "task1", done: true},
              {title: "task2", done: false},
              {title: "task3", done: true},
              // Remote record should have been left intact.
              {title: "task4-remote", done: true},
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
              strategy: Kinto.syncStrategy.CLIENT_WINS
            }).then(res => syncResult = res);
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
            expect(cleanRecord(syncResult.published[0])).eql({
              id: conflictingId,
              title: "task4-local",
              done: false,
            });
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should list resolved records", () => {
            expect(syncResult.resolved).to.have.length.of(1);
            expect(cleanRecord(syncResult.resolved[0])).eql({
              id: conflictingId,
              title: "task4-local",
              done: false,
            });
          });

          it("should put local database in the expected state", () => {
            return tasks.list({order: "title"})
              .then(res => res.data.map(record => ({
                title: record.title,
                done: record.done,
                _status: record._status,
              })))
              .should.become([
                {title: "task1", _status: "synced", done: true},
                {title: "task2", _status: "synced", done: false},
                {title: "task3", _status: "synced", done: true},
                // For CLIENT_WINS strategy, local record is marked as synced
                {title: "task4-local", _status: "synced", done: false},
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              // local task4 should have been published to the server.
              {title: "task1", done: true},
              {title: "task2", done: false},
              {title: "task3", done: true},
              {title: "task4-local", done: false},
            ]);
          });

          describe("On next MANUAL sync", () => {
            let nextSyncResult;

            beforeEach(() => {
              return tasks.sync().then(result => {
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
              expect(nextSyncResult.lastModified).eql(syncResult.lastModified);
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
        });

        describe("SERVER_WINS strategy", () => {
          beforeEach(() => {
            return testSync(testData, {
              strategy: Kinto.syncStrategy.SERVER_WINS
            }).then(res => syncResult = res);
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

          it("should have no incoming conflict listed", () => {
            expect(syncResult.conflicts).to.have.length.of(0);
          });

          it("should not skip records", () => {
            expect(syncResult.skipped).to.have.length.of(0);
          });

          it("should not import anything", () => {
            expect(syncResult.created).to.have.length.of(0);
          });

          it("should publish resolved conflict using remote version", () => {
            expect(syncResult.published).to.have.length.of(1);
            expect(cleanRecord(syncResult.published[0])).eql({
              id: conflictingId,
              title: "task4-remote",
              done: true,
            });
          });

          it("should not update anything", () => {
            expect(syncResult.updated).to.have.length.of(0);
          });

          it("should list resolved records", () => {
            expect(syncResult.resolved).to.have.length.of(1);
            expect(cleanRecord(syncResult.resolved[0])).eql({
              id: conflictingId,
              title: "task4-remote",
              done: true,
            });
          });

          it("should put local database in the expected state", () => {
            return tasks.list({order: "title"})
              .then(res => res.data.map(record => ({
                title: record.title,
                done: record.done,
                _status: record._status,
              })))
              .should.become([
                {title: "task1", _status: "synced", done: true},
                {title: "task2", _status: "synced", done: false},
                {title: "task3", _status: "synced", done: true},
                // For SERVER_WINS strategy, remote record is marked as synced
                {title: "task4-remote", _status: "synced", done: true},
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              {title: "task1", done: true},
              {title: "task2", done: false},
              {title: "task3", done: true},
              // remote task4 should have been published to the server.
              {title: "task4-remote", done: true},
            ]);
          });

          describe("On next MANUAL sync", () => {
            let nextSyncResult;

            beforeEach(() => {
              return tasks.sync().then(result => {
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
              expect(nextSyncResult.lastModified).eql(syncResult.lastModified);
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
        });

        describe("Resolving conflicts doesn't interfere with sync", () => {
          const conflictingId = uuid4();
          const testData = {
            localSynced: [
              {id: conflictingId, title: "conflicting task", done: false}
            ],
            localUnsynced: [],
            server: [],
          };
          beforeEach(() => testSync(testData));
          it("should sync over resolved records", () => {
            return tasks.update({id: conflictingId, title: "locally changed title"},
                         {patch: true})
              .then(newRecord => {
                expect(newRecord.data.last_modified).to.exist;
                return tasks.api.bucket("default").collection("tasks").updateRecord(
                  {id: conflictingId, title: "remotely changed title"}, {patch: true});
              })
              .then(() => tasks.sync())
              .then(syncResult => {
                expect(syncResult.ok).eql(false);
                expect(syncResult.conflicts).to.have.length.of(1);
                // always pick our version, which has an older last_modified
                return tasks.resolve(syncResult.conflicts[0], syncResult.conflicts[0].local);
              })
              .then(() => tasks.sync())
              .then(syncResult => {
                expect(syncResult.ok).eql(true);
                expect(syncResult.conflicts).to.have.length.of(0);
                expect(syncResult.updated).to.have.length.of(0);
              })
              .then(() => tasks.get(conflictingId))
              .then(record => {
                expect(record.data.title).eql("locally changed title");
                expect(record.data._status).eql("synced");
              });
          });

          it("should not skip other conflicts", () => {
            const conflictingId2 = uuid4();
            const rawCollection = tasks.api.bucket("default").collection("tasks");
            return tasks.create({id: conflictingId2, title: "second title"},
                                {useRecordId: true})
              .then(() => tasks.sync())
              .then(() =>
                rawCollection.updateRecord(
                  {id: conflictingId, title: "remotely changed title"}, {patch: true})
                   )
              .then(() =>
                rawCollection.updateRecord(
                  {id: conflictingId2, title: "remotely changed title2"}, {patch: true}))
              .then(() => tasks.update({id: conflictingId, title: "locally changed title"},
                                       {patch: true}))
              .then(() => tasks.update({id: conflictingId2, title: "local title2"},
                                       {patch: true}))
              .then(() => tasks.sync())
              .then(syncResult => {
                expect(syncResult.ok).eql(false);
                expect(syncResult.conflicts).to.have.length.of(2);
                // resolve just one conflict and ensure that the other
                // one continues preventing the sync, even though it
                // happened "after" the first conflict
                return tasks.resolve(syncResult.conflicts[1], syncResult.conflicts[1].local);
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

      describe("Outgoing conflict", () => {
        let syncResult;

        beforeEach(() => {
          let recordId;
          return fetch(`${TEST_KINTO_SERVER}/buckets/default/collections/tasks/records`, {
            method: "POST",
            headers: {
              "Accept":        "application/json",
              "Content-Type":  "application/json",
              "Authorization": "Basic " + btoa("user:pass"),
            },
            body: JSON.stringify({data: {title: "task1-remote", done: true}})
          })
            .then(_ => tasks.sync())
            .then(res => {
              recordId = res.created[0].id;
              return tasks.delete(recordId, { virtual: false });
            }).then(_ => tasks.create({
              id: recordId,
              title: "task1-local",
              done: false
            }, { useRecordId: true }));
        });

        describe("MANUAL strategy (default)", () => {
          beforeEach(() => {
            return tasks.sync()
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
            return tasks.list({order: "title"})
              .then(res => res.data.map(record => ({
                title: record.title,
                _status: record._status,
              })))
              .should.become([
                // For MANUAL strategy, local conficting record is left intact
                {title: "task1-local", _status: "created"},
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              // local version should have been published to the server.
              {title: "task1-remote", done: true},
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
            return tasks.sync({strategy: Kinto.syncStrategy.CLIENT_WINS})
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
            expect(syncResult.resolved[0].title).eql("task1-local");
          });

          it("should put local database in the expected state", () => {
            return tasks.list({order: "title"})
              .then(res => res.data.map(record => ({
                title: record.title,
                _status: record._status,
              })))
              .should.become([
                // For CLIENT_WINS strategy, local version is marked as synced
                {title: "task1-local", _status: "synced"},
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              {title: "task1-local", done: false},
            ]);
          });

          describe("On next MANUAL sync", () => {
            let nextSyncResult;

            beforeEach(() => {
              return tasks.sync().then(result => {
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
              expect(nextSyncResult.lastModified).eql(syncResult.lastModified);
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
        });

        describe("SERVER_WINS strategy", () => {
          beforeEach(() => {
            return tasks.sync({strategy: Kinto.syncStrategy.SERVER_WINS})
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
            expect(syncResult.resolved[0].title).eql("task1-remote");
          });

          it("should put local database in the expected state", () => {
            return tasks.list({order: "title"})
              .then(res => res.data.map(record => ({
                title: record.title,
                _status: record._status,
              })))
              .should.become([
                // For SERVER_WINS strategy, local version is marked as synced
                {title: "task1-remote", _status: "synced"},
              ]);
          });

          it("should put remote test server data in the expected state", () => {
            return getRemoteList().should.become([
              {title: "task1-remote", done: true},
            ]);
          });

          describe("On next MANUAL sync", () => {
            let nextSyncResult;

            beforeEach(() => {
              return tasks.sync().then(result => {
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
              expect(nextSyncResult.lastModified).eql(syncResult.lastModified);
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
        });
      });

      describe("Batch request chunking", () => {
        let nbFixtures;

        function loadFixtures() {
          return tasks.api.fetchServerSettings()
            .then(serverSettings => {
              nbFixtures = serverSettings["cliquet.batch_max_requests"] + 10;
              const fixtures = [];
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

    describe("Schemas", () => {
      function createIntegerIdSchema() {
        let _next = 0;
        return {
          generate() {
            return _next++;
          },
          validate(id) {
            return ((id == parseInt(id, 10)) && (id >= 0));
          }
        };
      }

      describe("IdSchema", () => {
        beforeEach(() => {
          tasks = kinto.collection("tasks", {
            idSchema: createIntegerIdSchema()
          });
        });

        it("should generate id's using the IdSchema", () => {
          return tasks.create({ foo: "bar"}).then(record => {
            return record.data.id;
          }).should.become(0);
        });
      });
    });

    describe("Transformers", () => {
      function createTransformer(char) {
        return {
          encode(record) {
            return Object.assign({}, record, {title: record.title + char});
          },
          decode(record) {
            return Object.assign({}, record, {title: record.title.slice(0, -1)});
          }
        };
      }

      beforeEach(() => {
        tasks = kinto.collection("tasks", {
          remoteTransformers: [
            createTransformer("!"),
            createTransformer("?")
          ]
        });

        return Promise.all([
          tasks.create({id: uuid4(), title: "abc"}, {useRecordId: true}),
          tasks.create({id: uuid4(), title: "def"}, {useRecordId: true}),
        ]);
      });

      it("should list published records unencoded", () => {
        return tasks.sync()
          .then(res => res.published.map(x => x.title).sort())
          .should.become(["abc", "def"]);
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

  describe("Flushed server", function() {
    before(() => server.start());

    after(() => server.stop());

    beforeEach(() => {
      return tasks.clear()
        .then(_ => {
          return Promise.all([
            tasks.create({name: "foo"}),
            tasks.create({name: "bar"}),
          ]);
        })
        .then(_ => tasks.sync())
        .then(_ => server.flush());
    });

    it("should reject a call to sync() with appropriate message", () => {
      return tasks.sync()
        .should.be.rejectedWith(Error, "Server has been flushed");
    });

    it("should allow republishing local collection to flushed server", () => {
      return tasks.sync()
        .catch(_ => tasks.resetSyncStatus())
        .then(_ => tasks.sync())
        .should.eventually.have.property("published").to.have.length.of(2);
    });
  });

  describe("Backed off server", () => {
    before(() => server.start({CLIQUET_BACKOFF: 10}));

    after(() => server.stop());

    beforeEach(() => {
      return tasks.clear().then(_ => server.flush());
    });

    it("should reject sync when the server sends a Backoff header", () => {
      // Note: first call receive the Backoff header, second actually rejects.
      return tasks.sync().then(_ => tasks.sync())
        .should.be.rejectedWith(Error, /Server is asking clients to back off; retry in 10s/);
    });
  });

  describe("Deprecated protocol version", () => {
    beforeEach(() => {
      return tasks.clear().then(_ => server.flush());
    });

    describe("Soft EOL", () => {
      before(() => {
        const tomorrow = new Date(new Date().getTime() + 86400000).toJSON().slice(0, 10);
        return server.start({
          CLIQUET_EOS: tomorrow,
          CLIQUET_EOS_URL: "http://www.perdu.com",
          CLIQUET_EOS_MESSAGE: "Boom",
        });
      });

      after(() => server.stop());

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
        return server.start({
          CLIQUET_EOS: lastWeek,
          CLIQUET_EOS_URL: "http://www.perdu.com",
          CLIQUET_EOS_MESSAGE: "Boom",
        });
      });

      after(() => server.stop());

      beforeEach(() => sandbox.stub(console, "warn"));

      it("should reject with a 410 Gone when hard EOL is received", () => {
        return tasks.sync()
          .should.be.rejectedWith(Error, /HTTP 410 Gone: Service deprecated/);
      });
    });
  });
});
