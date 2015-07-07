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
 * @param  {String} str  A string to quote.
 * @return {String}
 */
export function quote(str) {
  return `"${str}"`;
}

/**
 * Trim double quotes from specified string.
 * @param  {String} str  A string to unquote.
 * @return {String}
 */
export function unquote(str) {
  return str.replace(/^"/, "").replace(/"$/, "");
}

/**
 * Sorts records in a list according a given ordering.
 * @param  {String} ordering The ordering.
 * @param  {Array}  list     The collection to order.
 * @return {Array}
 */
export function sortObjects(ordering, list) {
  const hasDash = ordering[0] === "-";
  const field = hasDash ? ordering.slice(1) : ordering;
  const direction = hasDash ? -1 : 1;
  return list.slice().sort((a, b) => {
    if (!a[field] || !b[field])
      return 0;
    return a[field] > b[field] ? direction : -direction;
  });
}
