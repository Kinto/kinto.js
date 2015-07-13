"use strict";

import Collection from "../src/collection";
import { v4 as uuid4 } from "uuid";
import btoa from "btoa";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import Kinto from "../src";
import { cleanRecord } from "../src/api";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_KINTO_SERVER = "http://0.0.0.0:8888/v1";

describe("Integration tests", () => {
  var tasks;

  beforeEach(() => {
    tasks = new Kinto({
      remote: TEST_KINTO_SERVER,
      headers: {Authorization: "Basic " + btoa("user:pass")}
    }).collection("tasks");

    return tasks.clear()
      .then(_ => fetch(`${TEST_KINTO_SERVER}/__flush__`, {method: "POST"}))
      .then(res => {
        if (res.status !== 202)
          throw new Error("Unable to flush test server.");
      });
  });

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

  describe("Settings", () => {
    it("should retrieve server settings", () => {
      return tasks.sync().then(_ => tasks.api.serverSettings)
        to.eventualy.include.keys("cliquet.batch_max_requests");
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
});
