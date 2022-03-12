import KintoClientBase, {
  KintoClientOptions,
  SUPPORTED_PROTOCOL_VERSION,
} from "./base";
import type { AggregateResponse } from "./batch";
import Collection from "./collection";
import type {
  KintoObject,
  KintoIdObject,
  KintoResponse,
  Permission,
  PermissionData,
} from "./types";

export default class KintoClient extends KintoClientBase {
  constructor(remote: string, options: Partial<KintoClientOptions> = {}) {
    const events = options.events;

    super(remote, Object.assign({ events }, options));
  }
}

export {
  KintoObject,
  KintoIdObject,
  Collection,
  AggregateResponse,
  KintoResponse,
  Permission,
  PermissionData,
  SUPPORTED_PROTOCOL_VERSION,
};
