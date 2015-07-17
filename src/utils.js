"use strict";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
 * Checks if a value is undefined.
 * @param  {Any}  value
 * @return {Boolean}
 */
function _isUndefined(value) {
  return typeof value === "undefined";
}

/**
 * Sorts records in a list according to a given ordering.
 * @param  {String} ordering The ordering.
 * @param  {Array}  list     The collection to order.
 * @return {Array}
 */
export function sortObjects(order, list) {
  const hasDash = order[0] === "-";
  const field = hasDash ? order.slice(1) : order;
  const direction = hasDash ? -1 : 1;
  return list.slice().sort((a, b) => {
    if (a[field] && _isUndefined(b[field]))
      return direction;
    if (b[field] && _isUndefined(a[field]))
      return -direction;
    if (_isUndefined(a[field]) && _isUndefined(b[field]))
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

/**
 * Chunks an array into n pieces.
 *
 * @param  {Array}  array
 * @param  {Number} n
 * @return {Array}
 */
export function partition(array, n) {
  if (n <= 0)
    return array;
  return array.reduce((acc, x, i) => {
    if (i === 0 || i % n === 0)
      acc.push([x]);
    else
      acc[acc.length - 1].push(x);
    return acc;
  }, []);
}

/**
 * Checks if a string is an UUID, according to RFC4122.
 *
 * @param  {String} uuid The uuid to validate.
 * @return {Boolean}
 */
export function isUUID4(uuid) {
  return RE_UUID.test(uuid);
}

/**
 * Returns the current UNIX timestamp.
 *
 * @return {Number}
 */
export function getUnixTime() {
  return Math.floor(new Date().getTime() / 1000);
}
