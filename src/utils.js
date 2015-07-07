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
export function sortObjects(order, list) {
  const hasDash = order[0] === "-";
  const field = hasDash ? order.slice(1) : order;
  const direction = hasDash ? -1 : 1;
  return list.slice().sort((a, b) => {
    if (!a[field] || !b[field])
      return 0;
    return a[field] > b[field] ? direction : -direction;
  });
}

/**
 * Filters records in a list matching all given filters.
 * @param  {String} filters  The filters object.
 * @param  {Array}  list     The collection to order.
 * @return {Array}
 */
export function filterObjects(filters, list) {
  return list.filter(entry => {
    return Object.keys(filters).every(filter => {
      return entry[filter] === filters[filter];
    });
  });
}

/**
 * Filter and sort list against provided filters and order.
 * @param  {Object} filters  The filters to apply.
 * @param  {String} order    The order to apply.
 * @param  {Array}  list     The list to reduce.
 * @return {Array}
 */
export function reduceRecords(filters, order, list) {
  return sortObjects(order, filterObjects(filters, list));
}
