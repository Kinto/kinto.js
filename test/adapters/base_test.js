"use strict";

import { expect } from "chai";

import BaseAdapter from "../../src/adapters/base";

describe("adapters.BaseAdapter", () => {
  let adapter;
  beforeEach(() => (adapter = new BaseAdapter()));

  it("should throw for non-implemented methods", () => {
    expect(() => adapter.clear()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.execute()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.get()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.list()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.saveLastModified()).to.Throw(
      Error,
      "Not Implemented."
    );
    expect(() => adapter.getLastModified()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.importBulk()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.loadDump()).to.Throw(Error, "Not Implemented.");
  });
});
