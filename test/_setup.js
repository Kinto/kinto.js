"use strict";

/**
 * Test environment setup.
 */
const root = typeof global === "object" ? global : window;

/**
 * In FakeIndexedDB, symbols are exposed using ``FDB`` prefixes in names.
 * This piece of code will register them with the same names as native API,
 * only if indexedDB is not already available.
 */
if (typeof root.indexedDB !== "object") {
  const iDBSymbols = [
    "IDBDatabase",
    "IDBTransaction",
    "IDBObjectStore",
    "IDBIndex",
    "IDBCursor",
    "IDBCursorWithValue",
    "IDBKeyRange",
  ];

  iDBSymbols.forEach(symbol => {
    const fakeSymbol = symbol.replace("IDB", "FDB");
    root[symbol] = require(`fake-indexeddb/lib/${fakeSymbol}`);
  });

  root.indexedDB = require("fake-indexeddb");
}

root.FormData = require("form-data");
root.Headers = require("node-fetch").Headers;
