"use strict";

import sinon from "sinon";
import chai, { expect } from "chai";

import BaseAdapter from "../../src/adapters/base";

describe("adapters.BaseAdapter", () => {
  var adapter;
  beforeEach(() => adapter = new BaseAdapter());

  it("should throw for non-implemented methods", () => {
    expect(() => adapter.clear()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.create()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.update()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.get()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.list()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.saveLastModified()).to.Throw(Error, "Not Implemented.");
    expect(() => adapter.getLastModified()).to.Throw(Error, "Not Implemented.");
  });
});
