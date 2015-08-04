"use strict";

/**
 * Remote transformer class, providing an interface for encoding and decoding
 * records.
 *
 * This class is provided as a base class you should extend to implement your
 * own remote transformers.
 */
export default class RemoteTransformer {
  get type() {
    return "remote";
  }

  encode() {
    throw new Error("Not implemented.");
  }

  decode() {
    throw new Error("Not implemented.");
  }
}
