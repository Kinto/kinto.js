"use strict";

import { expect } from "chai";

import BaseAdapter from "../../built/adapters/base";

describe("adapters.BaseAdapter", () => {
  let adapter;
  beforeEach(() => adapter = new BaseAdapter());

  it("should fulfill calls to open", () => {
    return adapter.open().should.be.fulfilled;
  });

  it("should fulfill calls to close", () => {
    return adapter.close().should.be.fulfilled;
  });

  it("should throw for non-implemented methods", () => {
    expect(() => adapter.clear()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.execute()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.get()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.list()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.saveLastModified()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.getLastModified()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.loadDump()).to.Throw(Error, "Not Implemented.");
  });
});
