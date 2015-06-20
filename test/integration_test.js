"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import Cliquetis from "../src";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

describe.only("Integration tests", () => {
  var articles;

  before(() => {
    // start kinto
  });

  after(() => {
    // stop kinto
  });

  beforeEach(() => {
    articles = new Cliquetis({remote: "http://0.0.0.0:8000/v0"})
      .collection("articles");
  });

  afterEach(() => articles.clear());

  describe("Synchronization", function() {
    it("import records", function() {

    });
  });
});
