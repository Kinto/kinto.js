"use strict";

import chai, { expect } from "chai";

import {
  quote,
  unquote,
  sortObjects,
  filterObjects,
  reduceRecords,
  partition,
  isUUID4,
  waterfall,
} from "../src/utils";

chai.should();
chai.config.includeStack = true;

describe("Utils", () => {
  /** @test {quote} */
  describe("#quote", () => {
    it("should add quotes to provided string", () => {
      const quoted = quote("42");
      expect(quoted).eql("\"42\"");
    });
  });

  /** @test {unquote} */
  describe("#unquote", () => {
    it("should remove quotes to provided string", () => {
      const unquoted = unquote("\"42\"");
      expect(unquoted).eql("42");
    });

    it("should return the same string is not quoted", () => {
      const unquoted = unquote("42");
      expect(unquoted).eql("42");
    });
  });

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
  });

  /** @test {partition} */
  describe("#partition", () => {
    it("should chunk array", () => {
      expect(partition([1, 2, 3], 2)).eql([[1, 2], [3]]);
      expect(partition([1, 2, 3], 1)).eql([[1], [2], [3]]);
      expect(partition([1, 2, 3, 4, 5], 3)).eql([[1, 2, 3], [4, 5]]);
      expect(partition([1, 2], 2)).eql([[1, 2]]);
    });

    it("should not chunk array with n<=0", () => {
      expect(partition([1, 2, 3], 0)).eql([1, 2, 3]);
      expect(partition([1, 2, 3], -1)).eql([1, 2, 3]);
    });
  });

  /** @test {isUUID4} */
  describe("#isUUID4", () => {
    it("should check that a string uses a valid UUID format", () => {
      expect(isUUID4("110ec58a-a0f2-4ac4-8393-c866d813b8d1")).eql(true);
    });

    it("should check that a string does not use a valid UUID format", () => {
      expect(isUUID4("110ex58a-a0f2-4ac4-8393-c866d813b8d1")).eql(false);
      expect(isUUID4("")).eql(false);
      expect(isUUID4(null)).eql(false);
      expect(isUUID4(undefined)).eql(false);
      expect(isUUID4(42)).eql(false);
      expect(isUUID4({})).eql(false);
      expect(isUUID4("00000000-0000-5000-a000-000000000000")).eql(false);
      expect(isUUID4("00000000-0000-4000-e000-000000000000")).eql(false);
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
});
