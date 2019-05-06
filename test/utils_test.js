"use strict";

import chai, { expect } from "chai";

import {
  deepEqual,
  sortObjects,
  filterObjects,
  omitKeys,
  waterfall,
  transformSubObjectFilters,
} from "../src/utils";

chai.should();
chai.config.includeStack = true;

describe("Utils", () => {
  /** @test {sortObjects} */
  describe("#sortObjects", () => {
    it("should order on field ASC", () => {
      expect(sortObjects("title", [{ title: "b" }, { title: "a" }])).eql([
        { title: "a" },
        { title: "b" },
      ]);
    });

    it("should order on field DESC", () => {
      expect(sortObjects("-title", [{ title: "a" }, { title: "b" }])).eql([
        { title: "b" },
        { title: "a" },
      ]);
    });

    it("should order on mixed undefined values DESC", () => {
      expect(
        sortObjects("-title", [
          { title: undefined },
          { title: "b" },
          { title: undefined },
        ])
      ).eql([{ title: "b" }, { title: undefined }, { title: undefined }]);
    });

    it("should order on mixed undefined values ASC", () => {
      expect(
        sortObjects("title", [
          { title: undefined },
          { title: "b" },
          { title: undefined },
        ])
      ).eql([{ title: undefined }, { title: undefined }, { title: "b" }]);
    });

    it("should not change order on all fields undefined", () => {
      expect(
        sortObjects("-title", [
          { title: undefined, x: 1 },
          { title: undefined, x: 2 },
        ])
      ).eql([{ title: undefined, x: 1 }, { title: undefined, x: 2 }]);
    });

    it("should not order the list on missing field", () => {
      expect(sortObjects("-missing", [{ title: "a" }, { title: "b" }])).eql([
        { title: "a" },
        { title: "b" },
      ]);
    });
  });

  /** @test {filterObjects} */
  describe("#filterObjects", () => {
    it("should filter list on a single field query", () => {
      expect(
        filterObjects({ title: "a" }, [{ title: "b" }, { title: "a" }])
      ).eql([{ title: "a" }]);
    });

    it("should filter list on a multiple fields query", () => {
      expect(
        filterObjects({ title: "a", unread: true }, [
          { title: "b", unread: true },
          { title: "a", unread: false },
          { title: "a", unread: true },
        ])
      ).eql([{ title: "a", unread: true }]);
    });

    it("should filter list on missing field", () => {
      expect(filterObjects({ missing: true }, [{ existing: true }])).eql([]);
    });

    it("should filter on multiple field values", () => {
      expect(
        filterObjects({ title: ["a", "c"] }, [
          { title: "a" },
          { title: "b" },
          { title: "c" },
          { title: "d" },
        ])
      ).eql([{ title: "a" }, { title: "c" }]);
    });
  });

  /** @test {waterfall} */
  describe("#waterfall", () => {
    it("should resolve with init value when list is empty", () => {
      return waterfall([], 42).should.become(42);
    });

    it("should resolve executing a single sync function", () => {
      return waterfall([x => x + 1], 42).should.become(43);
    });

    it("should resolve executing multiple sync functions", () => {
      return waterfall([x => x + 1, x => x * 2], 42).should.become(86);
    });

    it("should resolve using a single promise returning function", () => {
      return waterfall([() => Promise.resolve(42)]).should.become(42);
    });

    it("should resolve using multiple promise returning functions", () => {
      return waterfall(
        [x => Promise.resolve(x + 1), x => Promise.resolve(x * 2)],
        42
      ).should.become(86);
    });
  });

  describe("deepEqual", () => {
    it("should return true if values are equal", () => {
      expect(deepEqual(null, null)).eql(true);
      expect(deepEqual(undefined, undefined)).eql(true);
      expect(deepEqual(1, 1)).eql(true);
      expect(deepEqual(1, 1.0)).eql(true);
      expect(deepEqual("a", "a")).eql(true);
      expect(deepEqual({}, {})).eql(true);
      expect(deepEqual([], [])).eql(true);
    });

    it("should return true if key are not sorted", () => {
      expect(deepEqual({ a: "1", b: 2 }, { b: 2, a: "1" })).eql(true);
    });

    it("should return true if array values are equal", () => {
      expect(deepEqual({ a: [1, 2, 3] }, { a: [1, 2, 3] })).eql(true);
    });

    it("should return true if sub-objects are equal", () => {
      expect(deepEqual({ a: { b: 1, c: 2 } }, { a: { b: 1, c: 2 } })).eql(true);
    });

    it("should return false if one is falsy", () => {
      expect(deepEqual({ id: "1" }, null)).eql(false);
      expect(deepEqual({ id: "1" }, undefined)).eql(false);
      expect(deepEqual(null, undefined)).eql(false);
    });

    it("should return false with extra keys", () => {
      expect(deepEqual({ a: 1 }, { a: 1, b: "a" })).eql(false);
    });

    it("should return false with different types", () => {
      expect(deepEqual({ a: 1 }, { a: "1" })).eql(false);
    });

    it("should return true when object keys order differs", () => {
      expect(deepEqual({ a: { b: 1, c: 2 } }, { a: { c: 2, b: 1 } })).eql(true);
    });

    it("should return false if sub-object differs", () => {
      expect(deepEqual({ a: { b: 1, c: 2 } }, { a: { b: 1, c: 3 } })).eql(
        false
      );
    });

    it("should return true if sub-arrays of objects are equal", () => {
      expect(
        deepEqual({ a: [{ b: 1 }, { c: 1 }] }, { a: [{ b: 1 }, { c: 1 }] })
      ).eql(true);
    });

    it("should return false if sub-array orders differ", () => {
      expect(
        deepEqual({ a: [{ b: 1 }, { c: 1 }] }, { a: [{ c: 1 }, { b: 1 }] })
      ).eql(false);
    });
  });

  describe("omitKeys", () => {
    it("should return same object if no key is passed", () => {
      const input = { a: 1, b: 2 };
      expect(omitKeys(input)).eql(input);
    });

    it("should omit specified keys", () => {
      expect(omitKeys({ a: 1, b: 2 }, ["b", "c"])).eql({ a: 1 });
    });
  });

  describe("transformSubObjectFilters", () => {
    it("should convert string in dot notation to nested object", () => {
      const input = { "a.b.c.d": 0 };
      expect(transformSubObjectFilters(input)).eql({
        a: { b: { c: { d: 0 } } },
      });
    });

    it("multiple strings with repeated keys become one object with unique keys", () => {
      const input = {
        "a.b.c.d": 0,
        "a.b.c.arr": [1, 2, 3],
        "a.b.k.hello": "world",
      };
      expect(transformSubObjectFilters(input)).eql({
        a: {
          b: {
            c: {
              d: 0,
              arr: [1, 2, 3],
            },
            k: {
              hello: "world",
            },
          },
        },
      });
    });
  });
});
