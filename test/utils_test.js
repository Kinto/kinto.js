"use strict";

import chai, { expect } from "chai";

import {
  attachFakeIDBSymbolsTo,
  quote,
  unquote,
  sortObjects,
  filterObjects,
  reduceRecords,
  partition
} from "../src/utils";

chai.should();
chai.config.includeStack = true;

describe("Utils", () => {
  describe("#attachFakeIDBSymbolsTo", () => {
    it("should attach fake IDB symbols to provided object", () => {
      var obj = {};

      attachFakeIDBSymbolsTo(obj);

      expect(obj).to.include.keys([
        "IDBCursor",
        "IDBCursorWithValue",
        "IDBIndex",
        "IDBKeyRange",
        "IDBObjectStore",
        "IDBTransaction",
        "indexedDB",
      ]);
    });
  });

  it("should not attach IDB symbols if they exist", () => {
    var obj = {indexedDB: {}};

    attachFakeIDBSymbolsTo(obj);

    expect(obj).to.not.include.keys([
      "IDBCursor",
      "IDBCursorWithValue",
      "IDBIndex",
      "IDBKeyRange",
      "IDBObjectStore",
      "IDBTransaction",
      "indexedDB",
    ]);
  });

  describe("#quote", () => {
    it("should add quotes to provided string", () => {
      var quoted = quote("42");
      expect(quoted).eql('"42"');
    });
  });

  describe("#unquote", () => {
    it("should remove quotes to provided string", () => {
      var unquoted = unquote('"42"');
      expect(unquoted).eql("42");
    });

    it("should return the same string is not quoted", () => {
      var unquoted = unquote("42");
      expect(unquoted).eql("42")
    })
  });

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

  describe("#partition", function() {
    it("should chunk array", function() {
      expect(partition([1, 2, 3], 2)).eql([[1, 2], [3]]);
      expect(partition([1, 2, 3], 1)).eql([[1], [2], [3]]);
      expect(partition([1, 2, 3, 4, 5], 3)).eql([[1, 2, 3], [4, 5]]);
      expect(partition([1, 2], 2)).eql([[1, 2]]);
    });

    it("should not chunk array with n<=0", function() {
      expect(partition([1, 2, 3], 0)).eql([1, 2, 3]);
      expect(partition([1, 2, 3], -1)).eql([1, 2, 3]);
    });
  });
});
