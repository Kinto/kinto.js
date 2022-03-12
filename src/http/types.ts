export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export interface KintoRequest {
  method?: HttpMethod;
  path: string;
  headers: HeadersInit;
  body?: any;
}

export interface KintoIdObject {
  id: string;
  [key: string]: unknown;
}

export interface KintoObject extends KintoIdObject {
  last_modified: number;
}

export type Permission =
  | "bucket:create"
  | "read"
  | "write"
  | "collection:create"
  | "group:create"
  | "record:create";

export interface User {
  id: string;
  principals: string[];
  bucket: string;
}

export interface ServerCapability {
  description: string;
  url: string;
  version?: string;
  [key: string]: unknown;
}

export interface ServerSettings {
  readonly: boolean;
  batch_max_requests: number;
}

export interface HelloResponse {
  project_name: string;
  project_version: string;
  http_api_version: string;
  project_docs: string;
  url: string;
  settings: ServerSettings;
  user?: User;
  capabilities: { [key: string]: ServerCapability };
}

export interface OperationResponse<T = KintoObject> {
  status: number;
  path: string;
  body: { data: T };
  headers: Record<string, string>;
}

export interface BatchResponse {
  responses: OperationResponse[];
}

export interface DataResponse<T> {
  data: T;
}

export type MappableObject = { [key in string | number]: unknown };

export interface KintoResponse<T = unknown> {
  data: KintoObject & T;
  permissions: { [key in Permission]?: string[] };
}

export interface HistoryEntry<T> {
  action: "create" | "update" | "delete";
  collection_id: string;
  date: string;
  id: string;
  last_modified: number;
  record_id: string;
  resource_name: string;
  target: KintoResponse<T>;
  timestamp: number;
  uri: string;
  user_id: string;
}

export interface PermissionData {
  bucket_id: string;
  collection_id?: string;
  id: string;
  permissions: Permission[];
  resource_name: string;
  uri: string;
}

export interface Attachment {
  filename: string;
  hash: string;
  location: string;
  mimetype: string;
  size: number;
}

export interface Group extends KintoObject {
  members: string[];
}

export interface Emitter {
  emit(type: string, event?: any): void;
  on(type: string, handler: (event?: any) => void): void;
  off(type: string, handler: (event?: any) => void): void;
}

export interface FetchHeaders {
  keys(): IterableIterator<string> | string[];
  entries(): IterableIterator<[string, string]> | [string, string][];
  get(name: string): string | null;
  has(name: string): boolean;
}

export interface FetchResponse {
  status: number;
  statusText: string;
  text(): Promise<string>;
  headers: FetchHeaders;
}

export type FetchFunction = (
  input: RequestInfo,
  init?: RequestInit | undefined
) => Promise<FetchResponse>;
