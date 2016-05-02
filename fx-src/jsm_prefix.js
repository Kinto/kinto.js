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

/*
 * This file is generated from kinto.js - do not modify directly.
 */

this.EXPORTED_SYMBOLS = ["loadKinto"];

/* Fix for Kinto/kinto.js#400
 * This is a mock for the Buffer object, missing from Gecko environment
 * and used by deeper.deepEqual() function.
 * Since browserify is used with --bare option for the Gecko client,
 * it is not included in the resulting dist file.
 *
 * XXX: We could get rid of deeper and clean this.
 * https://github.com/Kinto/kinto.js/issues/402
 */
this.Buffer = {
  isBuffer: function() { return false; }
};
