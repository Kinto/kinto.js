"use strict";

import { expect } from "chai";

import UUIDSchema from "../../src/schemas/uuidschema";

describe("UUIDSchema", () => {
  var schema;
  beforeEach(() => schema = new UUIDSchema());

  it("should have type idschema", () => {
    expect(schema.type).to.equal("idschema");
  });

  it("should generate a uuid", () => {
    expect(schema.generate()).to.be.a("string");
  });

  it("should positively validate a uuid", () => {
    expect(schema.validate("2dcd0e65-468c-4655-8015-30c8b3a1c8f8")).to.
        equal(true);
  });

  it("should negatively validate a uuid", () => {
    expect(schema.validate("foo")).to.equal(false);
  });
});
