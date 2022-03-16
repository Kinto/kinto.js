import { toDataBody, isObject, capable } from "./utils";
import Collection from "./collection";
import * as requests from "./requests";
import KintoClientBase, { PaginatedParams, PaginationResult } from "./base";
import {
  KintoRequest,
  KintoIdObject,
  Permission,
  KintoResponse,
  HistoryEntry,
  KintoObject,
  Group,
  OperationResponse,
  MappableObject,
} from "./types";
import { HttpResponse } from "./http";
import { AggregateResponse } from "./batch";

export interface BucketOptions {
  safe?: boolean;
  headers?: Record<string, string>;
  retry?: number;
}
/**
 * Abstract representation of a selected bucket.
 *
 */
export default class Bucket {
  private client: KintoClientBase;
  public name: string;
  private _endpoints: KintoClientBase["endpoints"];
  private _retry: number;
  private _safe: boolean;
  private _headers: Record<string, string>;

  /**
   * Constructor.
   *
   * @param  {KintoClient} client            The client instance.
   * @param  {String}      name              The bucket name.
   * @param  {Object}      [options={}]      The headers object option.
   * @param  {Object}      [options.headers] The headers object option.
   * @param  {Boolean}     [options.safe]    The safe option.
   * @param  {Number}      [options.retry]   The retry option.
   */
  constructor(
    client: KintoClientBase,
    name: string,
    options: BucketOptions = {}
  ) {
    /**
     * @ignore
     */
    this.client = client;
    /**
     * The bucket name.
     * @type {String}
     */
    this.name = name;

    this._endpoints = client.endpoints;

    /**
     * @ignore
     */
    this._headers = options.headers || {};
    this._retry = options.retry || 0;
    this._safe = !!options.safe;
  }

  get execute(): KintoClientBase["execute"] {
    return this.client.execute.bind(this.client);
  }

  get headers(): Record<string, string> {
    return this._headers;
  }

  /**
   * Get the value of "headers" for a given request, merging the
   * per-request headers with our own "default" headers.
   *
   * @private
   */
  private _getHeaders(options: {
    headers?: Record<string, string>;
  }): Record<string, string> {
    return {
      ...this._headers,
      ...options.headers,
    };
  }

  /**
   * Get the value of "safe" for a given request, using the
   * per-request option if present or falling back to our default
   * otherwise.
   *
   * @private
   * @param {Object} options The options for a request.
   * @returns {Boolean}
   */
  private _getSafe(options: { safe?: boolean }): boolean {
    return { safe: this._safe, ...options }.safe;
  }

  /**
   * As _getSafe, but for "retry".
   *
   * @private
   */
  private _getRetry(options: { retry?: number }): number {
    return { retry: this._retry, ...options }.retry;
  }

  /**
   * Selects a collection.
   *
   * @param  {String}  name              The collection name.
   * @param  {Object}  [options={}]      The options object.
   * @param  {Object}  [options.headers] The headers object option.
   * @param  {Boolean} [options.safe]    The safe option.
   * @return {Collection}
   */
  collection(
    name: string,
    options: {
      headers?: Record<string, string>;
      safe?: boolean;
      retry?: number;
    } = {}
  ): Collection {
    return new Collection(this.client, this, name, {
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
      safe: this._getSafe(options),
    });
  }

  /**
   * Retrieves the ETag of the collection list, for use with the `since` filtering option.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @param  {Number} [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<String, Error>}
   */
  async getCollectionsTimestamp(
    options: {
      headers?: Record<string, string>;
      retry?: number;
    } = {}
  ): Promise<string | null> {
    const path = this._endpoints.collection(this.name);
    const request: KintoRequest = {
      headers: this._getHeaders(options),
      path,
      method: "HEAD",
    };
    const { headers } = (await this.client.execute(request, {
      raw: true,
      retry: this._getRetry(options),
    })) as HttpResponse<{}>;
    return headers.get("ETag");
  }

  /**
   * Retrieves the ETag of the group list, for use with the `since` filtering option.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @param  {Number} [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<String, Error>}
   */
  async getGroupsTimestamp(
    options: {
      headers?: Record<string, string>;
      retry?: number;
    } = {}
  ): Promise<string | null> {
    const path = this._endpoints.group(this.name);
    const request: KintoRequest = {
      headers: this._getHeaders(options),
      path,
      method: "HEAD",
    };
    const { headers } = (await this.client.execute(request, {
      raw: true,
      retry: this._getRetry(options),
    })) as HttpResponse<{}>;
    return headers.get("ETag");
  }

  /**
   * Retrieves bucket data.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @param  {Object} [options.query]   Query parameters to pass in
   *     the request. This might be useful for features that aren't
   *     yet supported by this library.
   * @param  {Array}  [options.fields]  Limit response to
   *     just some fields.
   * @param  {Number} [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Object, Error>}
   */
  async getData<T>(
    options: {
      headers?: Record<string, string>;
      query?: { [key: string]: string };
      fields?: string[];
      retry?: number;
    } = {}
  ): Promise<T> {
    const path = this._endpoints.bucket(this.name);
    const request = {
      headers: this._getHeaders(options),
      path,
    };
    const { data } = (await this.client.execute(request, {
      retry: this._getRetry(options),
      query: options.query,
      fields: options.fields,
    })) as { data: T };
    return data;
  }

  /**
   * Set bucket data.
   * @param  {Object}  data                    The bucket data object.
   * @param  {Object}  [options={}]            The options object.
   * @param  {Object}  [options.headers={}]    The headers object option.
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Number}  [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Boolean} [options.patch]         The patch option.
   * @param  {Number}  [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async setData<T extends MappableObject>(
    data: T & { last_modified?: number },
    options: {
      headers?: Record<string, string>;
      safe?: boolean;
      retry?: number;
      patch?: boolean;
      last_modified?: number;
      permissions?: { [key in Permission]?: string[] };
    } = {}
  ): Promise<KintoResponse<T>> {
    if (!isObject(data)) {
      throw new Error("A bucket object is required.");
    }

    const bucket: T & { last_modified?: number; id?: string } = {
      ...data,
      id: this.name,
    };

    // For default bucket, we need to drop the id from the data object.
    // Bug in Kinto < 3.1.1
    const bucketId = bucket.id;
    if (bucket.id === "default") {
      delete bucket.id;
    }

    const path = this._endpoints.bucket(bucketId);
    const { patch, permissions } = options;
    const { last_modified } = { ...data, ...options };
    const request = requests.updateRequest(
      path,
      { data: bucket, permissions },
      {
        last_modified,
        patch,
        headers: this._getHeaders(options),
        safe: this._getSafe(options),
      }
    );
    return this.client.execute<KintoResponse<T>>(request, {
      retry: this._getRetry(options),
    }) as Promise<KintoResponse<T>>;
  }

  /**
   * Retrieves the list of history entries in the current bucket.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @param  {Number} [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Array<Object>, Error>}
   */
  @capable(["history"])
  async listHistory<T>(
    options: PaginatedParams & {
      headers?: Record<string, string>;
      retry?: number;
    } = {}
  ): Promise<PaginationResult<HistoryEntry<T>>> {
    const path = this._endpoints.history(this.name);
    return this.client.paginatedList<HistoryEntry<T>>(path, options, {
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
    });
  }

  /**
   * Retrieves the list of collections in the current bucket.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.filters={}] The filters object.
   * @param  {Object} [options.headers] The headers object option.
   * @param  {Number} [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @param  {Array}  [options.fields]  Limit response to
   *     just some fields.
   * @return {Promise<Array<Object>, Error>}
   */
  async listCollections(
    options: PaginatedParams & {
      filters?: Record<string, string | number>;
      headers?: Record<string, string>;
      retry?: number;
      fields?: string[];
    } = {}
  ): Promise<PaginationResult<KintoObject>> {
    const path = this._endpoints.collection(this.name);
    return this.client.paginatedList<KintoObject>(path, options, {
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
    });
  }

  /**
   * Creates a new collection in current bucket.
   *
   * @param  {String|undefined}  id          The collection id.
   * @param  {Object}  [options={}]          The options object.
   * @param  {Boolean} [options.safe]        The safe option.
   * @param  {Object}  [options.headers]     The headers object option.
   * @param  {Number}  [options.retry=0]     Number of retries to make
   *     when faced with transient errors.
   * @param  {Object}  [options.permissions] The permissions object.
   * @param  {Object}  [options.data]        The data object.
   * @return {Promise<Object, Error>}
   */
  async createCollection(
    id?: string,
    options: {
      safe?: boolean;
      headers?: Record<string, string>;
      retry?: number;
      permissions?: { [key in Permission]?: string[] };
      data?: any;
    } = {}
  ): Promise<KintoResponse<{}>> {
    const { permissions, data = {} } = options;
    data.id = id;
    const path = this._endpoints.collection(this.name, id);
    const request = requests.createRequest(
      path,
      { data, permissions },
      {
        headers: this._getHeaders(options),
        safe: this._getSafe(options),
      }
    );
    return this.client.execute<KintoResponse<{}>>(request, {
      retry: this._getRetry(options),
    }) as Promise<KintoResponse<{}>>;
  }

  /**
   * Deletes a collection from the current bucket.
   *
   * @param  {Object|String} collection              The collection to delete.
   * @param  {Object}        [options={}]            The options object.
   * @param  {Object}        [options.headers]       The headers object option.
   * @param  {Number}        [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Boolean}       [options.safe]          The safe option.
   * @param  {Number}        [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async deleteCollection(
    collection: string | KintoIdObject,
    options: {
      headers?: Record<string, string>;
      retry?: number;
      safe?: boolean;
      last_modified?: number;
    } = {}
  ): Promise<KintoResponse<{ deleted: boolean }>> {
    const collectionObj = toDataBody(collection);
    if (!collectionObj.id) {
      throw new Error("A collection id is required.");
    }
    const { id } = collectionObj;
    const { last_modified } = { ...collectionObj, ...options };
    const path = this._endpoints.collection(this.name, id);
    const request = requests.deleteRequest(path, {
      last_modified,
      headers: this._getHeaders(options),
      safe: this._getSafe(options),
    });
    return this.client.execute<KintoResponse<{ deleted: boolean }>>(request, {
      retry: this._getRetry(options),
    }) as Promise<KintoResponse<{ deleted: boolean }>>;
  }

  /**
   * Deletes collections from the current bucket.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.filters={}] The filters object.
   * @param  {Object} [options.headers] The headers object option.
   * @param  {Number} [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @param  {Array}  [options.fields]  Limit response to
   *     just some fields.
   * @return {Promise<Array<Object>, Error>}
   */
  async deleteCollections(
    options: PaginatedParams & {
      headers?: Record<string, string>;
      retry?: number;
    } = {}
  ): Promise<PaginationResult<KintoObject>> {
    const path = this._endpoints.collection(this.name);
    return this.client.paginatedDelete<KintoObject>(path, options, {
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
    });
  }

  /**
   * Retrieves the list of groups in the current bucket.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.filters={}] The filters object.
   * @param  {Object} [options.headers] The headers object option.
   * @param  {Number} [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @param  {Array}  [options.fields]  Limit response to
   *     just some fields.
   * @return {Promise<Array<Object>, Error>}
   */
  async listGroups(
    options: PaginatedParams & {
      headers?: Record<string, string>;
      retry?: number;
    } = {}
  ): Promise<PaginationResult<Group>> {
    const path = this._endpoints.group(this.name);
    return this.client.paginatedList<Group>(path, options, {
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
    });
  }

  /**
   * Fetches a group in current bucket.
   *
   * @param  {String} id                The group id.
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @param  {Number} [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @param  {Object} [options.query]   Query parameters to pass in
   *     the request. This might be useful for features that aren't
   *     yet supported by this library.
   * @param  {Array}  [options.fields]  Limit response to
   *     just some fields.
   * @return {Promise<Object, Error>}
   */
  async getGroup(
    id: string,
    options: {
      headers?: Record<string, string>;
      retry?: number;
      query?: { [key: string]: string };
      fields?: string[];
    } = {}
  ): Promise<KintoResponse<Group>> {
    const path = this._endpoints.group(this.name, id);
    const request = {
      headers: this._getHeaders(options),
      path,
    };
    return this.client.execute<KintoResponse<Group>>(request, {
      retry: this._getRetry(options),
      query: options.query,
      fields: options.fields,
    }) as Promise<KintoResponse<Group>>;
  }

  /**
   * Creates a new group in current bucket.
   *
   * @param  {String|undefined}  id                    The group id.
   * @param  {Array<String>}     [members=[]]          The list of principals.
   * @param  {Object}            [options={}]          The options object.
   * @param  {Object}            [options.data]        The data object.
   * @param  {Object}            [options.permissions] The permissions object.
   * @param  {Boolean}           [options.safe]        The safe option.
   * @param  {Object}            [options.headers]     The headers object option.
   * @param  {Number}            [options.retry=0]     Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Object, Error>}
   */
  async createGroup(
    id?: string,
    members: string[] = [],
    options: {
      data?: any;
      permissions?: { [key in Permission]?: string[] };
      safe?: boolean;
      headers?: Record<string, string>;
      retry?: number;
    } = {}
  ): Promise<KintoResponse<Group>> {
    const data = {
      ...options.data,
      id,
      members,
    };
    const path = this._endpoints.group(this.name, id);
    const { permissions } = options;
    const request = requests.createRequest(
      path,
      { data, permissions },
      {
        headers: this._getHeaders(options),
        safe: this._getSafe(options),
      }
    );
    return this.client.execute<KintoResponse<Group>>(request, {
      retry: this._getRetry(options),
    }) as Promise<KintoResponse<Group>>;
  }

  /**
   * Updates an existing group in current bucket.
   *
   * @param  {Object}  group                   The group object.
   * @param  {Object}  [options={}]            The options object.
   * @param  {Object}  [options.data]          The data object.
   * @param  {Object}  [options.permissions]   The permissions object.
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Object}  [options.headers]       The headers object option.
   * @param  {Number}  [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Number}  [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async updateGroup<T extends MappableObject>(
    group: KintoIdObject,
    options: {
      data?: T & { members?: string[] };
      permissions?: { [key in Permission]?: string[] };
      safe?: boolean;
      headers?: Record<string, string>;
      retry?: number;
      last_modified?: number;
      patch?: boolean;
    } = {}
  ): Promise<KintoResponse<T & { members: string[] }>> {
    if (!isObject(group)) {
      throw new Error("A group object is required.");
    }
    if (!group.id) {
      throw new Error("A group id is required.");
    }
    const data = {
      ...options.data,
      ...group,
    };
    const path = this._endpoints.group(this.name, group.id);
    const { patch, permissions } = options;
    const { last_modified } = { ...data, ...options };
    const request = requests.updateRequest(
      path,
      { data, permissions },
      {
        last_modified,
        patch,
        headers: this._getHeaders(options),
        safe: this._getSafe(options),
      }
    );
    return this.client.execute<KintoResponse<T & { members: string[] }>>(
      request,
      {
        retry: this._getRetry(options),
      }
    ) as Promise<KintoResponse<T & { members: string[] }>>;
  }

  /**
   * Deletes a group from the current bucket.
   *
   * @param  {Object|String} group                   The group to delete.
   * @param  {Object}        [options={}]            The options object.
   * @param  {Object}        [options.headers]       The headers object option.
   * @param  {Number}        [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Boolean}       [options.safe]          The safe option.
   * @param  {Number}        [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async deleteGroup(
    group: string | KintoIdObject,
    options: {
      headers?: Record<string, string>;
      retry?: number;
      safe?: boolean;
      last_modified?: number;
    } = {}
  ): Promise<KintoResponse<{ deleted: boolean }>> {
    const groupObj = toDataBody(group);
    const { id } = groupObj;
    const { last_modified } = { ...groupObj, ...options };
    const path = this._endpoints.group(this.name, id);
    const request = requests.deleteRequest(path, {
      last_modified,
      headers: this._getHeaders(options),
      safe: this._getSafe(options),
    });
    return this.client.execute<KintoResponse<{ deleted: boolean }>>(request, {
      retry: this._getRetry(options),
    }) as Promise<KintoResponse<{ deleted: boolean }>>;
  }

  /**
   * Deletes groups from the current bucket.
   *
   * @param  {Object} [options={}]          The options object.
   * @param  {Object} [options.filters={}]  The filters object.
   * @param  {Object} [options.headers]     The headers object option.
   * @param  {Number} [options.retry=0]     Number of retries to make
   *     when faced with transient errors.
   * @param  {Array}  [options.fields]      Limit response to
   *     just some fields.
   * @return {Promise<Array<Object>, Error>}
   */
  async deleteGroups(
    options: PaginatedParams & {
      headers?: Record<string, string>;
      retry?: number;
    } = {}
  ): Promise<PaginationResult<KintoObject>> {
    const path = this._endpoints.group(this.name);
    return this.client.paginatedDelete<KintoObject>(path, options, {
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
    });
  }

  /**
   * Retrieves the list of permissions for this bucket.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @param  {Number} [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Object, Error>}
   */
  async getPermissions(
    options: {
      headers?: Record<string, string>;
      retry?: number;
    } = {}
  ): Promise<{ [key in Permission]?: string[] }> {
    const request = {
      headers: this._getHeaders(options),
      path: this._endpoints.bucket(this.name),
    };
    const { permissions } = (await this.client.execute<KintoResponse>(request, {
      retry: this._getRetry(options),
    })) as KintoResponse;
    return permissions;
  }

  /**
   * Replaces all existing bucket permissions with the ones provided.
   *
   * @param  {Object}  permissions             The permissions object.
   * @param  {Object}  [options={}]            The options object
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Object}  [options.headers={}]    The headers object option.
   * @param  {Number}  [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Object}  [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async setPermissions(
    permissions: { [key in Permission]?: string[] },
    options: {
      safe?: boolean;
      headers?: Record<string, string>;
      retry?: number;
      last_modified?: number;
    } = {}
  ): Promise<KintoResponse<{}>> {
    if (!isObject(permissions)) {
      throw new Error("A permissions object is required.");
    }
    const path = this._endpoints.bucket(this.name);
    const { last_modified } = options;
    const data = { last_modified };
    const request = requests.updateRequest(
      path,
      { data, permissions },
      {
        headers: this._getHeaders(options),
        safe: this._getSafe(options),
      }
    );
    return this.client.execute<KintoResponse<{}>>(request, {
      retry: this._getRetry(options),
    }) as Promise<KintoResponse<{}>>;
  }

  /**
   * Append principals to the bucket permissions.
   *
   * @param  {Object}  permissions             The permissions object.
   * @param  {Object}  [options={}]            The options object
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Object}  [options.headers]       The headers object option.
   * @param  {Number}  [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Object}  [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async addPermissions(
    permissions: { [key in Permission]?: string[] },
    options: {
      safe?: boolean;
      headers?: Record<string, string>;
      retry?: number;
      last_modified?: number;
    } = {}
  ): Promise<KintoResponse<{}>> {
    if (!isObject(permissions)) {
      throw new Error("A permissions object is required.");
    }
    const path = this._endpoints.bucket(this.name);
    const { last_modified } = options;
    const request = requests.jsonPatchPermissionsRequest(
      path,
      permissions,
      "add",
      {
        last_modified,
        headers: this._getHeaders(options),
        safe: this._getSafe(options),
      }
    );
    return this.client.execute<KintoResponse<{}>>(request, {
      retry: this._getRetry(options),
    }) as Promise<KintoResponse<{}>>;
  }

  /**
   * Remove principals from the bucket permissions.
   *
   * @param  {Object}  permissions             The permissions object.
   * @param  {Object}  [options={}]            The options object
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Object}  [options.headers]       The headers object option.
   * @param  {Number}  [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Object}  [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async removePermissions(
    permissions: { [key in Permission]?: string[] },
    options: {
      safe?: boolean;
      headers?: Record<string, string>;
      retry?: number;
      last_modified?: number;
    } = {}
  ): Promise<KintoResponse<{}>> {
    if (!isObject(permissions)) {
      throw new Error("A permissions object is required.");
    }
    const path = this._endpoints.bucket(this.name);
    const { last_modified } = options;
    const request = requests.jsonPatchPermissionsRequest(
      path,
      permissions,
      "remove",
      {
        last_modified,
        headers: this._getHeaders(options),
        safe: this._getSafe(options),
      }
    );
    return this.client.execute<KintoResponse<{}>>(request, {
      retry: this._getRetry(options),
    }) as Promise<KintoResponse<{}>>;
  }

  /**
   * Performs batch operations at the current bucket level.
   *
   * @param  {Function} fn                   The batch operation function.
   * @param  {Object}   [options={}]         The options object.
   * @param  {Object}   [options.headers]    The headers object option.
   * @param  {Boolean}  [options.safe]       The safe option.
   * @param  {Number}   [options.retry=0]    The retry option.
   * @param  {Boolean}  [options.aggregate]  Produces a grouped result object.
   * @return {Promise<Object, Error>}
   */
  async batch(
    fn: (client: Bucket) => void,
    options: {
      headers?: Record<string, string>;
      safe?: boolean;
      retry?: number;
      aggregate?: boolean;
    } = {}
  ): Promise<OperationResponse<KintoObject>[] | AggregateResponse> {
    return this.client.batch(fn, {
      bucket: this.name,
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
      safe: this._getSafe(options),
      aggregate: !!options.aggregate,
    });
  }
}
