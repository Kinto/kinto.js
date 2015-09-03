"use strict";

/**
 * Id schema class, providing an interface for generating and validating
 * id's.
 *
 * This class is provided as a base class you should extend to implement your
 * own id schemas.
 */
export default class IdSchema {
  get type() {
    return "idschema";
  }

  generate() {
    throw new Error("Not implemented.");
  }

  validate(id) {
    throw new Error("Not implemented.");
  }
}
