"use strict";

import IdSchema from "./idschema";

import { v4 as uuid4 } from "uuid";
import { isUUID4 } from "../utils";

/**
 * The UUID4-based IdSchema used by default for Kinto collections.
 */
export default class UUIDSchema extends IdSchema {
  generate() {
    return uuid4();
  }

  validate(id) {
    return isUUID4(id);
  }
}
