"use strict";

import { expect } from "chai";

import RemoteTransformer from "../../src/transformers/remote";

describe("transformers.RemoteTransformer", () => {
  var transformer;
  beforeEach(() => transformer = new RemoteTransformer());

  it("should have type remote", () => {
    expect(transformer.type).to.equal("remote");
  });

  it("should throw for non-implemented methods", () => {
    expect(() => transformer.encode()).to.Throw(Error, "Not implemented.");
    expect(() => transformer.decode()).to.Throw(Error, "Not implemented.");
  });
});
