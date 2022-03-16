import { v4 as uuid } from "uuid";

import { capable, toDataBody, isObject } from "./utils";
import * as requests from "./requests";
import KintoClientBase, { PaginatedParams, PaginationResult } from "./base";
import Bucket from "./bucket";
import {
  KintoRequest,
  Permission,
  KintoResponse,
  KintoIdObject,
  KintoObject,
  Attachment,
  OperationResponse,
  MappableObject,
} from "./types";
import { HttpResponse } from "./http";
import { AggregateResponse } from "./batch";

export interface CollectionOptions {
  headers?: Record<string, string>;
  safe?: boolean;
  retry?: number;
}

/**
 * Abstract representation of a selected collection.
 *
 */
export default class Collection {
  public client: KintoClientBase;
  private bucket: Bucket;
  public name: string;
  private _endpoints: KintoClientBase["endpoints"];
  private _retry: number;
  private _safe: boolean;
  private _headers: Record<string, string>;

  /**
   * Constructor.
   *
   * @param  {KintoClient}  client            The client instance.
   * @param  {Bucket}       bucket            The bucket instance.
   * @param  {String}       name              The collection name.
   * @param  {Object}       [options={}]      The options object.
   * @param  {Object}       [options.headers] The headers object option.
   * @param  {Boolean}      [options.safe]    The safe option.
   * @param  {Number}       [options.retry]   The retry option.
   * @param  {Boolean}      [options.batch]   (Private) Whether this
   *     Collection is operating as part of a batch.
   */
  constructor(
    client: KintoClientBase,
    bucket: Bucket,
    name: string,
    options: CollectionOptions = {}
  ) {
    /**
     * @ignore
     */
    this.client = client;
    /**
     * @ignore
     */
    this.bucket = bucket;
    /**
     * The collection name.
     * @type {String}
     */
    this.name = name;

    this._endpoints = client.endpoints;

    /**
     * @ignore
     */
    this._retry = options.retry || 0;
    this._safe = !!options.safe;
    // FIXME: This is kind of ugly; shouldn't the bucket be responsible
    // for doing the merge?
    this._headers = {
      ...this.bucket.headers,
      ...options.headers,
    };
  }

  get execute(): KintoClientBase["execute"] {
    return this.client.execute.bind(this.client);
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
   * Retrieves the total number of records in this collection.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @param  {Number} [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<Number, Error>}
   */
  async getTotalRecords(
    options: { headers?: Record<string, string>; retry?: number } = {}
  ): Promise<number> {
    const path = this._endpoints.record(this.bucket.name, this.name);
    const request: KintoRequest = {
      headers: this._getHeaders(options),
      path,
      method: "HEAD",
    };
    const { headers } = await this.client.execute(request, {
      raw: true,
      retry: this._getRetry(options),
    });
    return parseInt(headers.get("Total-Records"), 10);
  }

  /**
   * Retrieves the ETag of the records list, for use with the `since` filtering option.
   *
   * @param  {Object} [options={}]      The options object.
   * @param  {Object} [options.headers] The headers object option.
   * @param  {Number} [options.retry=0] Number of retries to make
   *     when faced with transient errors.
   * @return {Promise<String, Error>}
   */
  async getRecordsTimestamp(
    options: { headers?: Record<string, string>; retry?: number } = {}
  ): Promise<string | null> {
    const path = this._endpoints.record(this.bucket.name, this.name);
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
   * Retrieves collection data.
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
    const path = this._endpoints.collection(this.bucket.name, this.name);
    const request = { headers: this._getHeaders(options), path };
    const { data } = (await this.client.execute(request, {
      retry: this._getRetry(options),
      query: options.query,
      fields: options.fields,
    })) as { data: T };
    return data;
  }

  /**
   * Set collection data.
   * @param  {Object}   data                    The collection data object.
   * @param  {Object}   [options={}]            The options object.
   * @param  {Object}   [options.headers]       The headers object option.
   * @param  {Number}   [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Boolean}  [options.safe]          The safe option.
   * @param  {Boolean}  [options.patch]         The patch option.
   * @param  {Number}   [options.last_modified] The last_modified option.
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
      throw new Error("A collection object is required.");
    }
    const { patch, permissions } = options;
    const { last_modified } = { ...data, ...options };

    const path = this._endpoints.collection(this.bucket.name, this.name);
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
    return this.client.execute<KintoResponse<T>>(request, {
      retry: this._getRetry(options),
    }) as Promise<KintoResponse<T>>;
  }

  /**
   * Retrieves the list of permissions for this collection.
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
    const path = this._endpoints.collection(this.bucket.name, this.name);
    const request = { headers: this._getHeaders(options), path };
    const { permissions } = (await this.client.execute<KintoResponse>(request, {
      retry: this._getRetry(options),
    })) as KintoResponse;
    return permissions;
  }

  /**
   * Replaces all existing collection permissions with the ones provided.
   *
   * @param  {Object}   permissions             The permissions object.
   * @param  {Object}   [options={}]            The options object
   * @param  {Object}   [options.headers]       The headers object option.
   * @param  {Number}   [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Boolean}  [options.safe]          The safe option.
   * @param  {Number}   [options.last_modified] The last_modified option.
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
    const path = this._endpoints.collection(this.bucket.name, this.name);
    const data = { last_modified: options.last_modified };
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
   * Append principals to the collection permissions.
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
    const path = this._endpoints.collection(this.bucket.name, this.name);
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
   * Remove principals from the collection permissions.
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
    const path = this._endpoints.collection(this.bucket.name, this.name);
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
   * Creates a record in current collection.
   *
   * @param  {Object}  record                The record to create.
   * @param  {Object}  [options={}]          The options object.
   * @param  {Object}  [options.headers]     The headers object option.
   * @param  {Number}  [options.retry=0]     Number of retries to make
   *     when faced with transient errors.
   * @param  {Boolean} [options.safe]        The safe option.
   * @param  {Object}  [options.permissions] The permissions option.
   * @return {Promise<Object, Error>}
   */
  async createRecord<T extends MappableObject>(
    record: T & { id?: string },
    options: {
      headers?: Record<string, string>;
      retry?: number;
      safe?: boolean;
      permissions?: { [key in Permission]?: string[] };
    } = {}
  ): Promise<KintoResponse<T>> {
    const { permissions } = options;
    const path = this._endpoints.record(this.bucket.name, this.name, record.id);
    const request = requests.createRequest(
      path,
      { data: record, permissions },
      {
        headers: this._getHeaders(options),
        safe: this._getSafe(options),
      }
    );
    return this.client.execute<KintoResponse<T>>(request, {
      retry: this._getRetry(options),
    }) as Promise<KintoResponse<T>>;
  }

  /**
   * Adds an attachment to a record, creating the record when it doesn't exist.
   *
   * @param  {String}  dataURL                 The data url.
   * @param  {Object}  [record={}]             The record data.
   * @param  {Object}  [options={}]            The options object.
   * @param  {Object}  [options.headers]       The headers object option.
   * @param  {Number}  [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Number}  [options.last_modified] The last_modified option.
   * @param  {Object}  [options.permissions]   The permissions option.
   * @param  {String}  [options.filename]      Force the attachment filename.
   * @param  {String}  [options.gzipped]       Force the attachment to be gzipped or not.
   * @return {Promise<Object, Error>}
   */
  @capable(["attachments"])
  async addAttachment(
    dataURI: string,
    record: { [key: string]: string } = {},
    options: {
      headers?: Record<string, string>;
      retry?: number;
      safe?: boolean;
      last_modified?: number;
      permissions?: { [key in Permission]?: string[] };
      filename?: string;
      gzipped?: boolean;
    } = {}
  ): Promise<
    KintoResponse<{
      attachment: Attachment;
    }>
  > {
    const { permissions } = options;
    const id = record.id || uuid();
    const path = this._endpoints.attachment(this.bucket.name, this.name, id);
    const { last_modified } = { ...record, ...options };
    const addAttachmentRequest = requests.addAttachmentRequest(
      path,
      dataURI,
      { data: record, permissions },
      {
        last_modified,
        filename: options.filename,
        gzipped: options.gzipped,
        headers: this._getHeaders(options),
        safe: this._getSafe(options),
      }
    );
    await this.client.execute(addAttachmentRequest, {
      stringify: false,
      retry: this._getRetry(options),
    });
    return this.getRecord<{ attachment: Attachment }>(id);
  }

  /**
   * Removes an attachment from a given record.
   *
   * @param  {Object}  recordId                The record id.
   * @param  {Object}  [options={}]            The options object.
   * @param  {Object}  [options.headers]       The headers object option.
   * @param  {Number}  [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Number}  [options.last_modified] The last_modified option.
   */
  @capable(["attachments"])
  async removeAttachment(
    recordId: string,
    options: {
      headers?: Record<string, string>;
      retry?: number;
      safe?: boolean;
      last_modified?: number;
    } = {}
  ): Promise<{}> {
    const { last_modified } = options;
    const path = this._endpoints.attachment(
      this.bucket.name,
      this.name,
      recordId
    );
    const request = requests.deleteRequest(path, {
      last_modified,
      headers: this._getHeaders(options),
      safe: this._getSafe(options),
    });
    return this.client.execute<{}>(request, {
      retry: this._getRetry(options),
    }) as Promise<{}>;
  }

  /**
   * Updates a record in current collection.
   *
   * @param  {Object}  record                  The record to update.
   * @param  {Object}  [options={}]            The options object.
   * @param  {Object}  [options.headers]       The headers object option.
   * @param  {Number}  [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Boolean} [options.safe]          The safe option.
   * @param  {Number}  [options.last_modified] The last_modified option.
   * @param  {Object}  [options.permissions]   The permissions option.
   * @return {Promise<Object, Error>}
   */
  async updateRecord<T>(
    record: T & { id: string },
    options: {
      headers?: Record<string, string>;
      retry?: number;
      safe?: boolean;
      last_modified?: number;
      permissions?: { [key in Permission]?: string[] };
      patch?: boolean;
    } = {}
  ): Promise<KintoResponse<T>> {
    if (!isObject(record)) {
      throw new Error("A record object is required.");
    }
    if (!record.id) {
      throw new Error("A record id is required.");
    }
    const { permissions } = options;
    const { last_modified } = { ...record, ...options };
    const path = this._endpoints.record(this.bucket.name, this.name, record.id);
    const request = requests.updateRequest(
      path,
      { data: record, permissions },
      {
        headers: this._getHeaders(options),
        safe: this._getSafe(options),
        last_modified,
        patch: !!options.patch,
      }
    );
    return this.client.execute<KintoResponse<T>>(request, {
      retry: this._getRetry(options),
    }) as Promise<KintoResponse<T>>;
  }

  /**
   * Deletes a record from the current collection.
   *
   * @param  {Object|String} record                  The record to delete.
   * @param  {Object}        [options={}]            The options object.
   * @param  {Object}        [options.headers]       The headers object option.
   * @param  {Number}        [options.retry=0]       Number of retries to make
   *     when faced with transient errors.
   * @param  {Boolean}       [options.safe]          The safe option.
   * @param  {Number}        [options.last_modified] The last_modified option.
   * @return {Promise<Object, Error>}
   */
  async deleteRecord(
    record: string | KintoIdObject,
    options: {
      headers?: Record<string, string>;
      retry?: number;
      safe?: boolean;
      last_modified?: number;
    } = {}
  ): Promise<KintoResponse<{ deleted: boolean }>> {
    const recordObj = toDataBody(record);
    if (!recordObj.id) {
      throw new Error("A record id is required.");
    }
    const { id } = recordObj;
    const { last_modified } = { ...recordObj, ...options };
    const path = this._endpoints.record(this.bucket.name, this.name, id);
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
   * Deletes records from the current collection.
   *
   * Sorting is done by passing a `sort` string option:
   *
   * - The field to order the results by, prefixed with `-` for descending.
   * Default: `-last_modified`.
   *
   * @see http://kinto.readthedocs.io/en/stable/api/1.x/sorting.html
   *
   * Filtering is done by passing a `filters` option object:
   *
   * - `{fieldname: "value"}`
   * - `{min_fieldname: 4000}`
   * - `{in_fieldname: "1,2,3"}`
   * - `{not_fieldname: 0}`
   * - `{exclude_fieldname: "0,1"}`
   *
   * @see http://kinto.readthedocs.io/en/stable/api/1.x/filtering.html
   *
   * @param  {Object}   [options={}]                    The options object.
   * @param  {Object}   [options.headers]               The headers object option.
   * @param  {Number}   [options.retry=0]               Number of retries to make
   *     when faced with transient errors.
   * @param  {Object}   [options.filters={}]            The filters object.
   * @param  {String}   [options.sort="-last_modified"] The sort field.
   * @param  {String}   [options.at]                    The timestamp to get a snapshot at.
   * @param  {String}   [options.limit=null]            The limit field.
   * @param  {String}   [options.pages=1]               The number of result pages to aggregate.
   * @param  {Number}   [options.since=null]            Only retrieve records modified since the provided timestamp.
   * @param  {Array}    [options.fields]                Limit response to just some fields.
   * @return {Promise<Object, Error>}
   */
  async deleteRecords<T extends KintoObject>(
    options: PaginatedParams & {
      headers?: Record<string, string>;
      retry?: number;
    } = {}
  ): Promise<PaginationResult<T>> {
    const path = this._endpoints.record(this.bucket.name, this.name);
    return this.client.paginatedDelete<T>(path, options, {
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
    });
  }

  /**
   * Retrieves a record from the current collection.
   *
   * @param  {String} id                The record id to retrieve.
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
  async getRecord<T>(
    id: string,
    options: {
      headers?: Record<string, string>;
      query?: { [key: string]: string };
      fields?: string[];
      retry?: number;
    } = {}
  ): Promise<KintoResponse<T>> {
    const path = this._endpoints.record(this.bucket.name, this.name, id);
    const request = { headers: this._getHeaders(options), path };
    return this.client.execute<KintoResponse<T>>(request, {
      retry: this._getRetry(options),
      query: options.query,
      fields: options.fields,
    }) as Promise<KintoResponse<T>>;
  }

  /**
   * Lists records from the current collection.
   *
   * Sorting is done by passing a `sort` string option:
   *
   * - The field to order the results by, prefixed with `-` for descending.
   * Default: `-last_modified`.
   *
   * @see http://kinto.readthedocs.io/en/stable/api/1.x/sorting.html
   *
   * Filtering is done by passing a `filters` option object:
   *
   * - `{fieldname: "value"}`
   * - `{min_fieldname: 4000}`
   * - `{in_fieldname: "1,2,3"}`
   * - `{not_fieldname: 0}`
   * - `{exclude_fieldname: "0,1"}`
   *
   * @see http://kinto.readthedocs.io/en/stable/api/1.x/filtering.html
   *
   * Paginating is done by passing a `limit` option, then calling the `next()`
   * method from the resolved result object to fetch the next page, if any.
   *
   * @param  {Object}   [options={}]                    The options object.
   * @param  {Object}   [options.headers]               The headers object option.
   * @param  {Number}   [options.retry=0]               Number of retries to make
   *     when faced with transient errors.
   * @param  {Object}   [options.filters={}]            The filters object.
   * @param  {String}   [options.sort="-last_modified"] The sort field.
   * @param  {String}   [options.at]                    The timestamp to get a snapshot at.
   * @param  {String}   [options.limit=null]            The limit field.
   * @param  {String}   [options.pages=1]               The number of result pages to aggregate.
   * @param  {Number}   [options.since=null]            Only retrieve records modified since the provided timestamp.
   * @param  {Array}    [options.fields]                Limit response to just some fields.
   * @return {Promise<Object, Error>}
   */
  async listRecords<T extends KintoObject>(
    options: PaginatedParams & {
      headers?: Record<string, string>;
      retry?: number;
      at?: number;
    } = {}
  ): Promise<PaginationResult<T>> {
    const path = this._endpoints.record(this.bucket.name, this.name);
    if (options.at) {
      return this.getSnapshot<T>(options.at);
    } else {
      return this.client.paginatedList<T>(path, options, {
        headers: this._getHeaders(options),
        retry: this._getRetry(options),
      });
    }
  }

  /**
   * @private
   */
  async isHistoryComplete(): Promise<boolean> {
    // We consider that if we have the collection creation event part of the
    // history, then all records change events have been tracked.
    const {
      data: [oldestHistoryEntry],
    } = await this.bucket.listHistory({
      limit: 1,
      filters: {
        action: "create",
        resource_name: "collection",
        collection_id: this.name,
      },
    });
    return !!oldestHistoryEntry;
  }

  /**
   * @private
   */
  @capable(["history"])
  async getSnapshot<T extends KintoObject>(
    at: number
  ): Promise<PaginationResult<T>> {
    if (!at || !Number.isInteger(at) || at <= 0) {
      throw new Error("Invalid argument, expected a positive integer.");
    }
    // Retrieve history and check it covers the required time range.
    // Ensure we have enough history data to retrieve the complete list of
    // changes.
    if (!(await this.isHistoryComplete())) {
      throw new Error(
        "Computing a snapshot is only possible when the full history for a " +
          "collection is available. Here, the history plugin seems to have " +
          "been enabled after the creation of the collection."
      );
    }

    // Because of https://github.com/Kinto/kinto-http.js/issues/963
    // we cannot simply rely on the history endpoint.
    // Our strategy here is to clean-up the history entries from the
    // records that were deleted via the plural endpoint.
    // We will detect them by comparing the current state of the collection
    // and the full history of the collection since its genesis.

    // List full history of collection.
    const { data: fullHistory } = await this.bucket.listHistory<T>({
      pages: Infinity, // all pages up to target timestamp are required
      sort: "last_modified", // chronological order
      filters: {
        resource_name: "record",
        collection_id: this.name,
      },
    });

    // Keep latest entry ever, and latest within snapshot window.
    // (history is sorted chronologically)
    const latestEver = new Map();
    const latestInSnapshot = new Map();
    for (const entry of fullHistory) {
      if (entry.target.data.last_modified <= at) {
        // Snapshot includes changes right on timestamp.
        latestInSnapshot.set(entry.record_id, entry);
      }
      latestEver.set(entry.record_id, entry);
    }

    // Current records ids in the collection.
    const { data: current } = await this.listRecords({
      pages: Infinity,
      fields: ["id"], // we don't need attributes.
    });
    const currentIds = new Set(current.map((record) => record.id));

    // If a record is not in the current collection, and its
    // latest history entry isn't a delete then this means that
    // it was deleted via the plural endpoint (and that we lost track
    // of this deletion because of bug #963)
    const deletedViaPlural = new Set();
    for (const entry of latestEver.values()) {
      if (entry.action != "delete" && !currentIds.has(entry.record_id)) {
        deletedViaPlural.add(entry.record_id);
      }
    }

    // Now reconstruct the collection based on latest version in snapshot
    // filtering all deleted records.
    const reconstructed = [];
    for (const entry of latestInSnapshot.values()) {
      if (entry.action != "delete" && !deletedViaPlural.has(entry.record_id)) {
        reconstructed.push(entry.target.data);
      }
    }

    return {
      last_modified: String(at),
      data: Array.from(reconstructed).sort(
        (a, b) => b.last_modified - a.last_modified
      ),
      next: () => {
        throw new Error("Snapshots don't support pagination");
      },
      hasNextPage: false,
      totalRecords: reconstructed.length,
    } as PaginationResult<T>;
  }

  /**
   * Performs batch operations at the current collection level.
   *
   * @param  {Function} fn                   The batch operation function.
   * @param  {Object}   [options={}]         The options object.
   * @param  {Object}   [options.headers]    The headers object option.
   * @param  {Boolean}  [options.safe]       The safe option.
   * @param  {Number}   [options.retry]      The retry option.
   * @param  {Boolean}  [options.aggregate]  Produces a grouped result object.
   * @return {Promise<Object, Error>}
   */
  async batch(
    fn: (client: Collection) => void,
    options: {
      headers?: Record<string, string>;
      safe?: boolean;
      retry?: number;
      aggregate?: boolean;
    } = {}
  ): Promise<OperationResponse<KintoObject>[] | AggregateResponse> {
    return this.client.batch(fn, {
      bucket: this.bucket.name,
      collection: this.name,
      headers: this._getHeaders(options),
      retry: this._getRetry(options),
      safe: this._getSafe(options),
      aggregate: !!options.aggregate,
    });
  }
}
