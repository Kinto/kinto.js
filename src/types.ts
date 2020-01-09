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
