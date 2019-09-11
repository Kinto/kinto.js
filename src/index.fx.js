/*
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

ChromeUtils.import("resource://gre/modules/Timer.jsm", global);
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
XPCOMUtils.defineLazyGlobalGetters(global, ["fetch", "indexedDB"]);

ChromeUtils.defineModuleGetter(
  global,
  "EventEmitter",
  "resource://gre/modules/EventEmitter.jsm"
);
// Use standalone kinto-http module landed in FFx.
ChromeUtils.defineModuleGetter(
  global,
  "KintoHttpClient",
  "resource://services-common/kinto-http-client.js"
);

XPCOMUtils.defineLazyGetter(global, "generateUUID", () => {
  const { generateUUID } = Cc["@mozilla.org/uuid-generator;1"].getService(
    Ci.nsIUUIDGenerator
  );
  return generateUUID;
});

import KintoBase from "./KintoBase";
import BaseAdapter from "./adapters/base";
import IDB from "./adapters/IDB";
import { RE_RECORD_ID } from "./utils";

export default class Kinto extends KintoBase {
  static get adapters() {
    return {
      BaseAdapter,
      IDB,
    };
  }

  get ApiClass() {
    return KintoHttpClient;
  }

  constructor(options = {}) {
    const events = {};
    EventEmitter.decorate(events);

    const defaults = {
      adapter: IDB,
      events,
    };
    super({ ...defaults, ...options });
  }

  collection(collName, options = {}) {
    const idSchema = {
      validate(id) {
        return typeof id == "string" && RE_RECORD_ID.test(id);
      },
      generate() {
        return generateUUID()
          .toString()
          .replace(/[{}]/g, "");
      },
    };
    return super.collection(collName, { idSchema, ...options });
  }
}
