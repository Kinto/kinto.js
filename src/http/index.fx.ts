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

import KintoClientBase, { KintoClientOptions } from "./base";
import * as errors from "./errors";
import { EventEmitter as ee } from "events";

declare const ChromeUtils: any;
const { EventEmitter } = ChromeUtils.import(
  "resource://gre/modules/EventEmitter.jsm"
) as { EventEmitter: any };

export default class KintoHttpClient extends KintoClientBase {
  constructor(remote: string, options: Partial<KintoClientOptions> = {}) {
    const events = {};
    EventEmitter.decorate(events);
    super(remote, { events: events as ee, ...options });
  }
}

(KintoHttpClient as any).errors = errors;
