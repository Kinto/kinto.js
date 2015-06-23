"use strict";

import chai, { expect } from "chai";

import { attachFakeIDBSymbolsTo, quote, unquote } from "../src/utils";

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
});
