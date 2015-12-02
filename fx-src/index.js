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

const Cu = Components.utils;

import BaseAdapter from "../src/adapters/base";
import KintoBase from "../src/KintoBase";
import FirefoxAdapter from "./FirefoxStorage";

export default function loadKinto() {
  const { EventEmitter } = Cu.import("resource://devtools/shared/event-emitter.js", {});

  Cu.import("resource://gre/modules/Timer.jsm");
  Cu.importGlobalProperties(['fetch']);

  class KintoFX extends KintoBase {
    static get adapters() {
      return {
        BaseAdapter: BaseAdapter,
        FirefoxAdapter: FirefoxAdapter
      };
    }

    constructor(options={}) {
      const emitter = {};
      EventEmitter.decorate(emitter);

      const defaults = {
        events: emitter
      };

      const expandedOptions = Object.assign(defaults, options);
      super(expandedOptions);
    }
  }

  return KintoFX;
}
