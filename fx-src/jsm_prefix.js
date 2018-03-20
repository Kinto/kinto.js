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

/*
 * This file is generated from kinto.js - do not modify directly.
 */

// This is required because with Babel compiles ES2015 modules into a
// require() form that tries to keep its modules on "this", but
// doesn't specify "this", leaving it to default to the global
// object. However, in strict mode, "this" no longer defaults to the
// global object, so expose the global object explicitly. Babel's
// compiled output will use a variable called "global" if one is
// present.
//
// See https://bugzilla.mozilla.org/show_bug.cgi?id=1394556#c3 for
// more details.
const global = this;

var EXPORTED_SYMBOLS = ["Kinto"];
