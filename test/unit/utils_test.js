"use strict";

import chai, { expect } from "chai";

import { attachFakeIDBSymbolsTo } from "../../src/utils";

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
});
