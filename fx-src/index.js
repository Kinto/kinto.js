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

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Timer.jsm");
Cu.importGlobalProperties(["fetch"]);
const { EventEmitter } = Cu.import("resource://gre/modules/EventEmitter.jsm", {});
const { generateUUID } = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);

// Use standalone kinto-http module landed in FFx.
const { KintoHttpClient } = Cu.import("resource://services-common/kinto-http-client.js");

import KintoBase from "../src/KintoBase";
import { RE_UUID } from "../src/utils";


export default class Kinto extends KintoBase {
  constructor(options={}) {
    const events = {};
    EventEmitter.decorate(events);

    const defaults = {
      events,
      ApiClass: KintoHttpClient,
    };
    super({...defaults, ...options});
  }

  collection(collName, options={}) {
    const idSchema = {
      validate: RE_UUID.test.bind(RE_UUID),
      generate: function() {
        return generateUUID().toString().replace(/[{}]/g, "");
      }
    };
    return super.collection(collName, {idSchema, ...options});
  }
}

// This fixes compatibility with CommonJS required by browserify.
// See http://stackoverflow.com/questions/33505992/babel-6-changes-how-it-exports-default/33683495#33683495
if (typeof module === "object") {
  module.exports = Kinto;
}
