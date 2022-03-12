/**
 * Chunks an array into n pieces.
 *
 * @private
 * @param  {Array}  array
 * @param  {Number} n
 * @return {Array}
 */
export function partition<T>(array: T[], n: number): T[][] {
  if (n <= 0) {
    return [array];
  }
  return array.reduce<T[][]>((acc, x, i) => {
    if (i === 0 || i % n === 0) {
      acc.push([x]);
    } else {
      acc[acc.length - 1].push(x);
    }
    return acc;
  }, []);
}

/**
 * Returns a Promise always resolving after the specified amount in milliseconds.
 *
 * @return Promise<void>
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Entity {
  id: string;
}

/**
 * Always returns a resource data object from the provided argument.
 *
 * @private
 * @param  {Object|String} resource
 * @return {Object}
 */
export function toDataBody<T extends Entity>(resource: T | string): Entity {
  if (isObject(resource)) {
    return resource as T;
  }
  if (typeof resource === "string") {
    return { id: resource };
  }
  throw new Error("Invalid argument.");
}

/**
 * Transforms an object into an URL query string, stripping out any undefined
 * values.
 *
 * @param  {Object} obj
 * @return {String}
 */
export function qsify(obj: { [key: string]: any }): string {
  const encode = (v: any): string =>
    encodeURIComponent(typeof v === "boolean" ? String(v) : v);
  const stripped = cleanUndefinedProperties(obj);
  return Object.keys(stripped)
    .map((k) => {
      const ks = encode(k) + "=";
      if (Array.isArray(stripped[k])) {
        return ks + stripped[k].map((v: any) => encode(v)).join(",");
      } else {
        return ks + encode(stripped[k]);
      }
    })
    .join("&");
}

/**
 * Checks if a version is within the provided range.
 *
 * @param  {String} version    The version to check.
 * @param  {String} minVersion The minimum supported version (inclusive).
 * @param  {String} maxVersion The minimum supported version (exclusive).
 * @throws {Error} If the version is outside of the provided range.
 */
export function checkVersion(
  version: string,
  minVersion: string,
  maxVersion: string
): void {
  const extract = (str: string): number[] =>
    str.split(".").map((x) => parseInt(x, 10));
  const [verMajor, verMinor] = extract(version);
  const [minMajor, minMinor] = extract(minVersion);
  const [maxMajor, maxMinor] = extract(maxVersion);
  const checks = [
    verMajor < minMajor,
    verMajor === minMajor && verMinor < minMinor,
    verMajor > maxMajor,
    verMajor === maxMajor && verMinor >= maxMinor,
  ];
  if (checks.some((x) => x)) {
    throw new Error(
      `Version ${version} doesn't satisfy ${minVersion} <= x < ${maxVersion}`
    );
  }
}

type DecoratorReturn = (
  target: any,
  key: string,
  descriptor: TypedPropertyDescriptor<(...args: any[]) => any>
) => {
  configurable: boolean;
  get(): (...args: any) => Promise<any>;
};

/**
 * Generates a decorator function ensuring a version check is performed against
 * the provided requirements before executing it.
 *
 * @param  {String} min The required min version (inclusive).
 * @param  {String} max The required max version (inclusive).
 * @return {Function}
 */
export function support(min: string, max: string): DecoratorReturn {
  return function (
    // @ts-ignore
    target: any,
    key: string,
    descriptor: TypedPropertyDescriptor<(...args: any[]) => any>
  ) {
    const fn = descriptor.value;
    return {
      configurable: true,
      get() {
        const wrappedMethod = (...args: any): Promise<any> => {
          // "this" is the current instance which its method is decorated.
          const client = (this as any).client ? (this as any).client : this;
          return client
            .fetchHTTPApiVersion()
            .then((version: string) => checkVersion(version, min, max))
            .then(() => fn!.apply(this, args));
        };
        Object.defineProperty(this, key, {
          value: wrappedMethod,
          configurable: true,
          writable: true,
        });
        return wrappedMethod;
      },
    };
  };
}

/**
 * Generates a decorator function ensuring that the specified capabilities are
 * available on the server before executing it.
 *
 * @param  {Array<String>} capabilities The required capabilities.
 * @return {Function}
 */
export function capable(capabilities: string[]): DecoratorReturn {
  return function (
    // @ts-ignore
    target: any,
    key: string,
    descriptor: TypedPropertyDescriptor<(...args: any[]) => any>
  ) {
    const fn = descriptor.value;
    return {
      configurable: true,
      get() {
        const wrappedMethod = (...args: any): Promise<any> => {
          // "this" is the current instance which its method is decorated.
          const client = (this as any).client ? (this as any).client : this;
          return client
            .fetchServerCapabilities()
            .then((available: string[]) => {
              const missing = capabilities.filter((c) => !(c in available));
              if (missing.length > 0) {
                const missingStr = missing.join(", ");
                throw new Error(
                  `Required capabilities ${missingStr} not present on server`
                );
              }
            })
            .then(() => fn!.apply(this, args));
        };
        Object.defineProperty(this, key, {
          value: wrappedMethod,
          configurable: true,
          writable: true,
        });
        return wrappedMethod;
      },
    };
  };
}

/**
 * Generates a decorator function ensuring an operation is not performed from
 * within a batch request.
 *
 * @param  {String} message The error message to throw.
 * @return {Function}
 */
export function nobatch(message: string): DecoratorReturn {
  return function (
    // @ts-ignore
    target: any,
    key: string,
    descriptor: TypedPropertyDescriptor<(...args: any[]) => any>
  ) {
    const fn = descriptor.value;
    return {
      configurable: true,
      get() {
        const wrappedMethod = (...args: any): any => {
          // "this" is the current instance which its method is decorated.
          if ((this as any)._isBatch) {
            throw new Error(message);
          }
          return fn!.apply(this, args);
        };
        Object.defineProperty(this, key, {
          value: wrappedMethod,
          configurable: true,
          writable: true,
        });
        return wrappedMethod;
      },
    };
  };
}

/**
 * Returns true if the specified value is an object (i.e. not an array nor null).
 * @param  {Object} thing The value to inspect.
 * @return {bool}
 */
export function isObject(thing: unknown): boolean {
  return typeof thing === "object" && thing !== null && !Array.isArray(thing);
}

interface TypedDataURL {
  type: string;
  base64: string;
  [key: string]: string;
}

/**
 * Parses a data url.
 * @param  {String} dataURL The data url.
 * @return {Object}
 */
export function parseDataURL(dataURL: string): TypedDataURL {
  const regex = /^data:(.*);base64,(.*)/;
  const match = dataURL.match(regex);
  if (!match) {
    throw new Error(`Invalid data-url: ${String(dataURL).substr(0, 32)}...`);
  }
  const props = match[1];
  const base64 = match[2];
  const [type, ...rawParams] = props.split(";");
  const params = rawParams.reduce<{ [key: string]: string }>((acc, param) => {
    const [key, value] = param.split("=");
    return { ...acc, [key]: value };
  }, {});
  return { ...params, type, base64 };
}

/**
 * Extracts file information from a data url.
 * @param  {String} dataURL The data url.
 * @return {Object}
 */
export function extractFileInfo(dataURL: string): {
  blob: Blob;
  name: string;
} {
  const { name, type, base64 } = parseDataURL(dataURL);
  const binary = atob(base64);
  const array = [];
  for (let i = 0; i < binary.length; i++) {
    array.push(binary.charCodeAt(i));
  }
  const blob = new Blob([new Uint8Array(array)], { type });

  return { blob, name };
}

/**
 * Creates a FormData instance from a data url and an existing JSON response
 * body.
 * @param  {String} dataURL            The data url.
 * @param  {Object} body               The response body.
 * @param  {Object} [options={}]       The options object.
 * @param  {Object} [options.filename] Force attachment file name.
 * @return {FormData}
 */
export function createFormData(
  dataURL: string,
  body: { [key: string]: any },
  options: { filename?: string } = {}
): FormData {
  const { filename = "untitled" } = options;
  const { blob, name } = extractFileInfo(dataURL);
  const formData = new FormData();
  formData.append("attachment", blob, name || filename);
  for (const property in body) {
    if (typeof body[property] !== "undefined") {
      formData.append(property, JSON.stringify(body[property]));
    }
  }
  return formData;
}

/**
 * Clones an object with all its undefined keys removed.
 * @private
 */
export function cleanUndefinedProperties(obj: { [key: string]: any }): {
  [key: string]: any;
} {
  const result: { [key: string]: any } = {};
  for (const key in obj) {
    if (typeof obj[key] !== "undefined") {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Handle common query parameters for Kinto requests.
 *
 * @param  {String}  [path]  The endpoint base path.
 * @param  {Array}   [options.fields]    Fields to limit the
 *   request to.
 * @param  {Object}  [options.query={}]  Additional query arguments.
 */
export function addEndpointOptions(
  path: string,
  options: { fields?: string[]; query?: { [key: string]: string } } = {}
): string {
  const query: { [key: string]: any } = { ...options.query };
  if (options.fields) {
    query._fields = options.fields;
  }
  const queryString = qsify(query);
  if (queryString) {
    return path + "?" + queryString;
  }
  return path;
}

/**
 * Replace authorization header with an obscured version
 */
export function obscureAuthorizationHeader(headers: HeadersInit): {
  [key: string]: string;
} {
  const h = new Headers(headers);
  if (h.has("authorization")) {
    h.set("authorization", "**** (suppressed)");
  }

  const obscuredHeaders: { [key: string]: string } = {};
  for (const [header, value] of h.entries()) {
    obscuredHeaders[header] = value;
  }

  return obscuredHeaders;
}
