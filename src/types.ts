import { KintoIdObject, Permission } from "kinto-http";
import Collection from "./collection";

export type $TSFixMe = any;

export type WithOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

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
  [key in AvailableHook]?: ((record: any, collection: Collection<T>) => any)[];
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

// const imports: {
//   type: "created" | "updated" | "deleted" | "resolved" | "errors" | "published" | "conflicts" | "skipped" | "void";
//   data?: any;
// }[]

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
