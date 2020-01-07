import { KintoIdObject, Permission } from "kinto-http";
import Collection from "./collection";

export interface IdSchema {
  generate(record?: any): string;
  validate(id: string): boolean;
}

export interface RemoteTransformer {
  encode(record: any): any;
  decode(record: any): any;
}

export type AvailableHook = "incoming-changes";

export type Hooks = {
  [key in AvailableHook]?: ((record: any, collection: Collection) => any)[];
};

export interface KintoRepresentation<T = unknown> {
  data: KintoIdObject & T;
  permissions: { [key in Permission]?: string[] };
}
