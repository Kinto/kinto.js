"use strict";

import { v4 as uuid4 } from "uuid";
import btoa from "btoa";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import Cliquetis from "../src";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

const TEST_KINTO_SERVER = "http://0.0.0.0:8888/v1";

describe.only("Integration tests", () => {
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

  describe("Synchronization", () => {
    const fixtures = [
      {title: "task1", done: true},
      {title: "task2", done: false},
      {title: "task3", done: false},
    ];

    beforeEach(() => {
      return Promise.all(fixtures.map(fixture => {
        return tasks.create(fixture);
      }));
    });

    describe("local updates", function() {
      it("should update local records from server response", () => {
        return tasks.sync()
          .then(res => res.updated.map(r => r.title))
            .should.eventually
              .include("task1")
              .include("task2")
              .include("task3");
      });

      it("should publish local records to the server", () => {
        return tasks.sync()
          .then(res => res.published.map(r => r.title))
            .should.eventually
              .include("task1")
              .include("task2")
              .include("task3");
      });

      describe("Importing new remote records", function() {
        var syncResult, createdId;

        beforeEach(() => {
          createdId = uuid4();
          return tasks.api.batch("default", "tasks", [
            {id: createdId, title: "task4", done: true}
          ])
            .then(_ => tasks.sync())
            .then(res => syncResult = res);
        });

        it("should list created records", function() {
          expect(syncResult.created).to.have.length.of(1);
          expect(syncResult.created[0].id).eql(createdId);
          expect(syncResult.created[0].title).eql("task4");
        });

        it("should import records", function() {
          return tasks.list()
            .then(res => res.data.map(r => r.title))
              .should.eventually
               .include("task1")
               .include("task2")
               .include("task3")
               .include("task4");
        });
      });
    });

    describe("remote updates", function() {
      it("should have updated the server", function() {
        return tasks.sync()
          .then(_ => tasks.api.fetchChangesSince("default", "tasks"))
          .then(res => res.changes.map(r => r.title))
          .should.eventually
            .include("task1")
            .include("task2")
            .include("task3");
      });
    });
  });
});
