import Collection from "./collection";

export type $TSFixMe = any;

export type WithOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export interface KintoRequest {
  method?: HttpMethod;
  path: string;
  headers: Record<string, unknown>;
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

export interface IdSchema {
  generate(record?: any): string;
  validate(id: string): boolean;
}

export interface RemoteTransformer {
  encode(record: any): any;
  decode(record: any): any;
}

export type AvailableHook = "incoming-changes";

export type Hooks<
  T extends { id: string; [key: string]: unknown } = { id: string }
> = {
  [key in AvailableHook]?: ((
    record: any,
    collection: Collection<T>
  ) => Promise<{ changes: T[] }>)[];
};

export interface KintoRepresentation<T = unknown> {
  data: T;
  permissions: { [key in Permission]?: string[] };
}

export type UndefiendKintoRepresentation<T> = WithOptional<
  KintoRepresentation<T>,
  "data"
>;

export interface UpdateRepresentation<T = unknown>
  extends KintoRepresentation<T> {
  oldRecord: KintoIdObject & T;
}

export type RecordStatus = "created" | "updated" | "deleted" | "synced";

export interface Conflict<T> {
  type: "incoming" | "outgoing";
  local: T;
  remote: T;
}

export interface Update<T> {
  old: T;
  new: T;
}

export interface KintoError {
  type: "incoming";
  message: string;
  stack?: string;
}

export interface SyncResult<T = $TSFixMe> {
  errors: KintoError[];
  created: T[];
  updated: Update<T>[];
  deleted: T[];
  published: T[];
  conflicts: Conflict<T>[];
  skipped: T[];
  resolved: T[];
  void: unknown[];
}

interface CreatedChange<T> {
  type: "created";
  data: T;
}

interface UpdatedChange<T> {
  type: "updated";
  data: Update<T>;
}

interface DeletedChange<T> {
  type: "deleted";
  data: T;
}

interface ResolvedChange {
  type: "resolved";
  data: never;
}

interface ErrorChange {
  type: "errors";
  data: never;
}

interface PublishedChange {
  type: "published";
  data: never;
}

export interface ConflictsChange<T> {
  type: "conflicts";
  data: Conflict<T>;
}

interface SkippedChange<T> {
  type: "skipped";
  data: T;
}

interface VoidChange {
  type: "void";
  data?: never;
}

export type Change<T> =
  | CreatedChange<T>
  | UpdatedChange<T>
  | DeletedChange<T>
  | ResolvedChange
  | ErrorChange
  | PublishedChange
  | ConflictsChange<T>
  | SkippedChange<T>
  | VoidChange;

export interface Emitter {
  emit(type: string, event?: any): void;
  on(type: string, handler: (event?: any) => void): void;
  off(type: string, handler: (event?: any) => void): void;
}

export interface CollectionSyncOptions {
  strategy?: string;
  headers?: Record<string, string>;
  retry?: number;
  ignoreBackoff?: boolean;
  bucket?: string | null;
  collection?: string | null;
  remote?: string | null;
  expectedTimestamp?: string | null;
}
