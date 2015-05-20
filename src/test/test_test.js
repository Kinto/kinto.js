import { expect } from "chai";

import foo from "../bar";

describe("test", function() {
  it("should pass", function() {
    expect(foo()).eql("plop");
  });
});
