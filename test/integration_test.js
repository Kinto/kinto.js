"use strict";

import { spawn } from "child_process";
import { v4 as uuid4 } from "uuid";
import btoa from "btoa";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import Kinto from "../src";
import { cleanRecord } from "../src/api";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_KINTO_SERVER = "http://0.0.0.0:8888/v1";
const PSERVE_EXECUTABLE = process.env.KINTO_PSERVE_EXECUTABLE || "pserve";
const KINTO_CONFIG = __dirname + "/kinto.ini";

describe("Integration tests", () => {
  let sandbox, server, kinto, tasks;
  const MAX_ATTEMPTS = 50;
  const serverLogs = [];

  function startServer(env) {
    return new Promise(resolve => {
      // Add the provided environment variables to the child process environment.
      // Keeping parent's environment is needed so that pserve's executable
      // can be found (with PATH) if KINTO_PSERVE_EXECUTABLE env variable was not provided.
      env = Object.assign({}, process.env, env);
      server = spawn(PSERVE_EXECUTABLE, [KINTO_CONFIG], {env, detached: true});
      server.stderr.on("data", data => {
        serverLogs.push(data);
      });
      server.on("close", code => {
        if (code && code > 0) {
          new Error("Server errors encountered:\n" +
            serverLogs.map(line => line.toString()).join(""));
        }
      });
      // Allow some time for the server to start.
      setTimeout(resolve, 1000);
    });
  }

  function stopServer() {
    server.kill();
    return new Promise(resolve => {
      setTimeout(() => resolve(), 500);
    });
  }

  function flushServer(attempt=1) {
    return fetch(`${TEST_KINTO_SERVER}/__flush__`, {method: "POST"})
      .then(res => {
        if ([202, 410].indexOf(res.status) === -1) {
          throw new Error("Unable to flush test server.");
        }
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

    kinto = new Kinto({
      remote: TEST_KINTO_SERVER,
      headers: {Authorization: "Basic " + btoa("user:pass")}
    });
    tasks = kinto.collection("tasks");
  });

  afterEach(() => sandbox.restore());

  describe("Default server configuration", () => {
    before(() => startServer());

    after(() => stopServer());

    beforeEach(() => {
      return tasks.clear().then(_ => flushServer());
    });

    describe("Settings", () => {
      it("should retrieve server settings", () => {
        return tasks.sync()
          .then(_ => tasks.api.serverSettings)
          .should.eventually.have.property("batch_max_requests").eql(25);
      });

      it("should share server settings across collections", () => {
        return tasks.sync()
          .then(_ => kinto.collection("articles").api.serverSettings)
          .should.eventually.have.property("batch_max_requests").eql(25);
      });
    });

    describe("Synchronization", () => {
      function testSync(data, options={}) {
        return Promise.all([].concat(
          // Create local unsynced records
          data.localUnsynced.map(record => tasks.create(record, {useRecordId: true})),
          // Create local synced records
          data.localSynced.map(record => tasks.create(record, {synced: true})),
          // Create remote records
          tasks.api.batch("default", "tasks", data.server)
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
          expect(cleanRecord(syncResult.created[0])).eql(testData.server[0]);
        });

        it("should publish local unsynced records", () => {
          expect(syncResult.published).to.have.length.of(1);
          expect(cleanRecord(syncResult.published[0])).eql(testData.localUnsynced[0]);
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
            // task1 and task4 are actually published to the server:
            // task1 was preexisting, task4 has been published through sync.
            // Note: task2 and task3 aren't listed because their synced local
            // status was faked, so they were not actually synced remotely.
            {title: "task1", done: true},
            {title: "task4", done: false},
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
      });

      describe("Outgoing conflict", () => {
        let syncResult;

        beforeEach(() => {
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
              return tasks.update(Object.assign({}, res.created[0], {
                title: "task1-local",
                done: false,
                last_modified: undefined
              }));
            });
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
                {title: "task1-local", _status: "updated"},
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
    before(() => startServer());

    after(() => stopServer());

    beforeEach(() => {
      return tasks.clear()
        .then(_ => {
          return Promise.all([
            tasks.create({name: "foo"}),
            tasks.create({name: "bar"}),
          ]);
        })
        .then(_ => tasks.sync())
        .then(_ => flushServer());
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
    before(() => startServer({CLIQUET_BACKOFF: 10}));

    after(() => stopServer());

    beforeEach(() => {
      return tasks.clear().then(_ => flushServer());
    });

    it("should reject sync when the server sends a Backoff header", () => {
      // Note: first call receive the Backoff header, second actually rejects.
      return tasks.sync().then(_ => tasks.sync())
        .should.be.rejectedWith(Error, /Server is backed off; retry in 10s/);
    });
  });

  describe("Deprecated protocol version", () => {
    beforeEach(() => {
      return tasks.clear().then(_ => flushServer());
    });

    describe("Soft EOL", () => {
      before(() => {
        const tomorrow = new Date(new Date().getTime() + 86400000).toJSON().slice(0, 10);
        return startServer({
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
        return startServer({
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
