import { KintoRequest, HttpMethod, Permission } from "./types";
import { createFormData } from "./utils";

interface RequestOptions {
  safe?: boolean;
  headers?: Headers | Record<string, string> | string[][];
  method?: HttpMethod;
  gzipped?: boolean | null;
  last_modified?: number;
  patch?: boolean;
}
type AddAttachmentRequestOptions = RequestOptions & {
  last_modified?: number;
  filename?: string;
};

type RequestBody = {
  data?: any;
  permissions?: Partial<Record<Permission, string[]>>;
};
interface RecordRequestBody extends RequestBody {
  data?: { id?: string; last_modified?: number; [key: string]: any };
}

const requestDefaults: RequestOptions = {
  safe: false,
  // check if we should set default content type here
  headers: {},
  patch: false,
};

/**
 * @private
 */
function safeHeader(
  safe?: boolean,
  last_modified?: number
): Record<string, string> {
  if (!safe) {
    return {};
  }
  if (last_modified) {
    return { "If-Match": `"${last_modified}"` };
  }
  return { "If-None-Match": "*" };
}

/**
 * @private
 */
export function createRequest(
  path: string,
  { data, permissions }: RequestBody,
  options: RequestOptions = {}
): KintoRequest {
  const { headers, safe } = {
    ...requestDefaults,
    ...options,
  };
  const method = options.method || (data && data.id) ? "PUT" : "POST";
  return {
    method,
    path,
    headers: { ...headers, ...safeHeader(safe) },
    body: { data, permissions },
  };
}

/**
 * @private
 */
export function updateRequest(
  path: string,
  { data, permissions }: RecordRequestBody,
  options: RequestOptions = {}
): KintoRequest {
  const { headers, safe, patch } = { ...requestDefaults, ...options };
  const { last_modified } = { ...data, ...options };

  const hasNoData =
    data &&
    Object.keys(data).filter((k) => k !== "id" && k !== "last_modified")
      .length === 0;
  if (hasNoData) {
    data = undefined;
  }

  return {
    method: patch ? "PATCH" : "PUT",
    path,
    headers: { ...headers, ...safeHeader(safe, last_modified) },
    body: { data, permissions },
  };
}

/**
 * @private
 */
export function jsonPatchPermissionsRequest(
  path: string,
  permissions: { [key in Permission]?: string[] },
  opType: string,
  options: RequestOptions = {}
): KintoRequest {
  const { headers, safe, last_modified } = { ...requestDefaults, ...options };

  const ops = [];

  for (const [type, principals] of Object.entries(permissions)) {
    if (principals) {
      for (const principal of principals) {
        ops.push({
          op: opType,
          path: `/permissions/${type}/${principal}`,
        });
      }
    }
  }

  return {
    method: "PATCH",
    path,
    headers: {
      ...headers,
      ...safeHeader(safe, last_modified),
      "Content-Type": "application/json-patch+json",
    },
    body: ops,
  };
}

/**
 * @private
 */
export function deleteRequest(
  path: string,
  options: RequestOptions = {}
): KintoRequest {
  const { headers, safe, last_modified } = {
    ...requestDefaults,
    ...options,
  };
  if (safe && !last_modified) {
    throw new Error("Safe concurrency check requires a last_modified value.");
  }
  return {
    method: "DELETE",
    path,
    headers: { ...headers, ...safeHeader(safe, last_modified) },
  };
}

/**
 * @private
 */
export function addAttachmentRequest(
  path: string,
  dataURI: string,
  { data, permissions }: RecordRequestBody = {},
  options: AddAttachmentRequestOptions = {}
): KintoRequest {
  const { headers, safe, gzipped } = { ...requestDefaults, ...options };
  const { last_modified } = { ...data, ...options };

  const body = { data, permissions };
  const formData = createFormData(dataURI, body, options);

  const customPath = `${path}${
    gzipped !== null ? "?gzipped=" + (gzipped ? "true" : "false") : ""
  }`;

  return {
    method: "POST",
    path: customPath,
    headers: { ...headers, ...safeHeader(safe, last_modified) },
    body: formData,
  };
}
