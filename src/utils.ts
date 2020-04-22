export const RE_RECORD_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Checks if a value is undefined.
 * @param  {Any}  value
 * @return {Boolean}
 */
function _isUndefined(value: unknown): boolean {
  return typeof value === "undefined";
}

/**
 * Sorts records in a list according to a given ordering.
 *
 * @param  {String} order The ordering, eg. `-last_modified`.
 * @param  {Array}  list  The collection to order.
 * @return {Array}
 */
export function sortObjects<T extends { [key: string]: any }>(
  order: string,
  list: T[]
): T[] {
  const hasDash = order[0] === "-";
  const field = hasDash ? order.slice(1) : order;
  const direction = hasDash ? -1 : 1;
  return list.slice().sort((a, b) => {
    if (a[field] && _isUndefined(b[field])) {
      return direction;
    }
    if (b[field] && _isUndefined(a[field])) {
      return -direction;
    }
    if (_isUndefined(a[field]) && _isUndefined(b[field])) {
      return 0;
    }
    return a[field] > b[field] ? direction : -direction;
  });
}

/**
 * Test if a single object matches all given filters.
 *
 * @param  {Object} filters  The filters object.
 * @param  {Object} entry    The object to filter.
 * @return {Boolean}
 */
export function filterObject<T extends { [key: string]: any }>(
  filters: { [key: string]: any },
  entry: T
): boolean {
  return Object.keys(filters).every((filter) => {
    const value = filters[filter];
    if (Array.isArray(value)) {
      return value.some((candidate) => candidate === entry[filter]);
    } else if (typeof value === "object") {
      return filterObject(value, entry[filter]);
    } else if (!Object.prototype.hasOwnProperty.call(entry, filter)) {
      console.error(`The property ${filter} does not exist`);
      return false;
    }
    return entry[filter] === value;
  });
}

/**
 * Filters records in a list matching all given filters.
 *
 * @param  {Object} filters  The filters object.
 * @param  {Array}  list     The collection to filter.
 * @return {Array}
 */
export function filterObjects<T>(
  filters: { [key: string]: any },
  list: T[]
): T[] {
  return list.filter((entry) => {
    return filterObject(filters, entry);
  });
}

/**
 * Resolves a list of functions sequentially, which can be sync or async; in
 * case of async, functions must return a promise.
 *
 * @param  {Array} fns  The list of functions.
 * @param  {Any}   init The initial value.
 * @return {Promise}
 */
export function waterfall(
  fns: ((...args: any[]) => unknown)[],
  init?: unknown
): Promise<unknown> {
  if (!fns.length) {
    return Promise.resolve(init);
  }
  return fns.reduce((promise, nextFn) => {
    return promise.then(nextFn);
  }, Promise.resolve(init));
}

/**
 * Simple deep object comparison function. This only supports comparison of
 * serializable JavaScript objects.
 *
 * @param  {Object} a The source object.
 * @param  {Object} b The compared object.
 * @return {Boolean}
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (!(a && typeof a === "object") || !(b && typeof b === "object")) {
    return false;
  }
  if (Object.keys(a).length !== Object.keys(b).length) {
    return false;
  }
  for (const k in a) {
    if (!deepEqual(a[k], b[k])) {
      return false;
    }
  }
  return true;
}

/**
 * Return an object without the specified keys.
 *
 * @param  {Object} obj        The original object.
 * @param  {Array}  keys       The list of keys to exclude.
 * @return {Object}            A copy without the specified keys.
 */
export function omitKeys<T extends { [key: string]: any }>(
  obj: T,
  keys: string[] = []
): Partial<T> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

export function arrayEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = a.length; i--; ) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function makeNestedObjectFromArr(
  arr: string[],
  val: any,
  nestedFiltersObj: { [key: string]: any }
): { [key: string]: any } {
  const last = arr.length - 1;
  return arr.reduce((acc, cv, i) => {
    if (i === last) {
      return (acc[cv] = val);
    } else if (Object.prototype.hasOwnProperty.call(acc, cv)) {
      return acc[cv];
    } else {
      return (acc[cv] = {});
    }
  }, nestedFiltersObj);
}

export function transformSubObjectFilters(filtersObj: { [key: string]: any }) {
  const transformedFilters = {};
  for (const key in filtersObj) {
    const keysArr = key.split(".");
    const val = filtersObj[key];
    makeNestedObjectFromArr(keysArr, val, transformedFilters);
  }
  return transformedFilters;
}
