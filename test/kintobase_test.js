"use strict";

import { expect } from "chai";

import KintoBase from "../src/KintoBase.js";
import BaseAdapter from "../src/adapters/base.js";

/** @test {KintoBase} */
describe("KintoBase", () => {
  describe("static properties", () => {
    describe("get adapters()", () => {
      it("should provide an adapters static getter", () => {
        expect(KintoBase.adapters).to.be.an("object");
      });

      it("should provide an adapters.BaseAdapter getter", () => {
        expect(KintoBase.adapters.BaseAdapter).to.eql(BaseAdapter);
      });
    });
  });

  describe("constructor", () => {
    it("should complain if a database adaptor is not provided", () => {
      expect(() => {
        new KintoBase();
      }).to.Throw(Error, /No adapter provided/);
    });
  });
});
