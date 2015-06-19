"use strict";

/**
 * In FakeIndexedDB, symbols are exposed using ``FDB`` prefixes in names.
 * This piece of code will register them with the same names as native API,
 * only if indexedDB is not already available.
 */
export function attachFakeIDBSymbolsTo(obj) {
  if (typeof obj.indexedDB === "object") {
    return;
  }
  const iDBSymbols = [
    "IDBTransaction",
    "IDBObjectStore",
    "IDBIndex",
    "IDBCursor",
    "IDBCursorWithValue",
    "IDBKeyRange",
  ];
  iDBSymbols.forEach(symbol => {
    let fakeSymbol = symbol.replace("IDB", "FDB");
    obj[symbol] = require(`fake-indexeddb/lib/${fakeSymbol}`);
  })
  obj.indexedDB = require("fake-indexeddb");
}

/**
 * Returns the specified string with double quotes.
 */
export function quote(str) {
  return `"${str}"`;
}

/**
 * Trim double quotes from specified string.
 */
export function unquote(str) {
  return str.replace(/^"/, "").replace(/"$/, "");
}
