"use strict";

import { expect } from "chai";

import IdSchema from "../../src/schemas/idschema";

describe("IdSchema", () => {
  var schema;
  beforeEach(() => schema = new IdSchema());

  it("should have type idschema", () => {
    expect(schema.type).to.equal("idschema");
  });

  it("should throw for non-implemented methods", () => {
    expect(() => schema.generate()).to.Throw(Error, "Not implemented.");
    expect(() => schema.validate()).to.Throw(Error, "Not implemented.");
  });
});
