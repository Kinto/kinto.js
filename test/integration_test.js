"use strict";

import { v4 as uuid4 } from "uuid";
import btoa from "btoa";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import Cliquetis from "../src";
import { cleanRecord } from "../src/api";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_KINTO_SERVER = "http://0.0.0.0:8888/v1";

describe("Integration tests", () => {
  var tasks;

  beforeEach(() => {
    tasks = new Cliquetis({
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
        expect(syncResult.updated).to.have.length.of(2);
        expect(syncResult.updated.map(r => cleanRecord(r))).to
          .include(testData.server[0])
          .include(testData.localUnsynced[0]);
      });
    });
  });
});
