"use strict";

import chai, { expect } from "chai";

import {
  sortObjects,
  filterObjects,
  reduceRecords,
  isUUID,
  waterfall,
  pFinally
} from "../src/utils";

chai.should();
chai.config.includeStack = true;

describe("Utils", () => {
  /** @test {sortObjects} */
  describe("#sortObjects", () => {
    it("should order on field ASC", () => {
      expect(sortObjects("title", [
        {title: "b"},
        {title: "a"},
      ])).eql([
        {title: "a"},
        {title: "b"},
      ]);
    });

    it("should order on field DESC", () => {
      expect(sortObjects("-title", [
        {title: "a"},
        {title: "b"},
      ])).eql([
        {title: "b"},
        {title: "a"},
      ]);
    });

    it("should order on mixed undefined values DESC", () => {
      expect(sortObjects("-title", [
        {title: undefined},
        {title: "b"},
        {title: undefined},
      ])).eql([
        {title: "b"},
        {title: undefined},
        {title: undefined},
      ]);
    });

    it("should order on mixed undefined values ASC", () => {
      expect(sortObjects("title", [
        {title: undefined},
        {title: "b"},
        {title: undefined},
      ])).eql([
        {title: undefined},
        {title: undefined},
        {title: "b"},
      ]);
    });

    it("should not change order on all fields undefined", () => {
      expect(sortObjects("-title", [
        {title: undefined, x: 1},
        {title: undefined, x: 2},
      ])).eql([
        {title: undefined, x: 1},
        {title: undefined, x: 2},
      ]);
    });

    it("should not order the list on missing field", () => {
      expect(sortObjects("-missing", [
        {title: "a"},
        {title: "b"},
      ])).eql([
        {title: "a"},
        {title: "b"},
      ]);
    });
  });

  /** @test {filterObjects} */
  describe("#filterObjects", () => {
    it("should filter list on a single field query", () => {
      expect(filterObjects({title: "a"}, [
        {title: "b"},
        {title: "a"},
      ])).eql([
        {title: "a"},
      ]);
    });

    it("should filter list on a multiple fields query", () => {
      expect(filterObjects({title: "a", unread: true}, [
        {title: "b", unread: true},
        {title: "a", unread: false},
        {title: "a", unread: true},
      ])).eql([
        {title: "a", unread: true},
      ]);
    });

    it("should filter list on missing field", () => {
      expect(filterObjects({missing: true}, [
        {existing: true},
      ])).eql([]);
    });

    it("should filter on multiple field values", () => {
      expect(filterObjects({title: ["a", "c"]}, [
        {title: "a"},
        {title: "b"},
        {title: "c"},
        {title: "d"},
      ])).eql([
        {title: "a"},
        {title: "c"},
      ]);
    });
  });

  /** @test {reduceRecords} */
  describe("#reduceRecords", () => {
    it("should filter and order list", () => {
      expect(reduceRecords({unread: false, complete: true}, "-title", [
        {title: "a", unread: true, complete: true},
        {title: "b", unread: false, complete: true},
        {title: "c", unread: false, complete: true},
      ])).eql([
        {title: "c", unread: false, complete: true},
        {title: "b", unread: false, complete: true},
      ]);
    });

    it("should support empty filter", () => {
      const records = [{a: 1}, {a: 2}];
      expect(reduceRecords({}, "-a", records)).eql(records.reverse());
    });

    it("should support empty sort order", () => {
      const records = [{a: 1}, {b: 2}];
      expect(reduceRecords({}, "", records)).eql(records);
    });
  });

  /** @test {isUUID} */
  describe("#isUUID", () => {
    it("should check that a string uses a valid UUID format", () => {
      expect(isUUID("63e5ccb8-1798-3b9f-48f5-12b5ca13054e")).eql(true);
      expect(isUUID("00000000-0000-5000-a000-000000000000")).eql(true);
      expect(isUUID("00000000-0000-4000-e000-000000000000")).eql(true);
    });

    it("should check that a string does not use a valid UUID format", () => {
      expect(isUUID("63e5xcb8-1798-4b9f-48f5-12b5ca13054e")).eql(false);
      expect(isUUID("")).eql(false);
      expect(isUUID(null)).eql(false);
      expect(isUUID(undefined)).eql(false);
      expect(isUUID(42)).eql(false);
      expect(isUUID({})).eql(false);
      expect(isUUID("00000000-0000-5000-a000-000000000000")).eql(true);
    });
  });

  /** @test {waterfall} */
  describe("#waterfall", () => {
    it("should resolve with init value when list is empty", () => {
      return waterfall([], 42)
        .should.become(42);
    });

    it("should resolve executing a single sync function", () => {
      return waterfall([x => x + 1], 42)
        .should.become(43);
    });

    it("should resolve executing multiple sync functions", () => {
      return waterfall([
        x => x + 1,
        x => x * 2,
      ], 42).should.become(86);
    });

    it("should resolve using a single promise returning function", () => {
      return waterfall([() => Promise.resolve(42)])
        .should.become(42);
    });

    it("should resolve using multiple promise returning functions", () => {
      return waterfall([
        x => Promise.resolve(x + 1),
        x => Promise.resolve(x * 2),
      ], 42).should.become(86);
    });
  });

  describe("pFinally", () => {
    it("should execute a callback when the promise succeeds", () => {
      let flag = false;

      return pFinally(Promise.resolve("plop"), () => flag = true)
        .then(res => {
          expect(flag).eql(true);
          expect(res).eql("plop");
        });
    });

    it("should execute a callback when the promise is rejected", () => {
      let flag = false;

      return pFinally(Promise.reject("err"), () => flag = true)
        .catch(err => {
          expect(flag).eql(true);
          expect(err).eql("err");
        });
    });
  });
});
