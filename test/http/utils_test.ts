import { btoa } from "./test_utils";
import {
  partition,
  delay,
  qsify,
  checkVersion,
  support,
  capable,
  nobatch,
  parseDataURL,
  extractFileInfo,
  cleanUndefinedProperties,
  addEndpointOptions,
} from "../../src/http/utils";
import { expectAsyncError } from "./test_utils";

const { expect } = intern.getPlugin("chai");
intern.getPlugin("chai").should();
const { describe, it } = intern.getPlugin("interface.bdd");

describe("HTTP Utils", () => {
  /** @test {partition} */
  describe("#partition", () => {
    it("should chunk array", () => {
      expect(partition([1, 2, 3], 2)).eql([[1, 2], [3]]);
      expect(partition([1, 2, 3], 1)).eql([[1], [2], [3]]);
      expect(partition([1, 2, 3, 4, 5], 3)).eql([
        [1, 2, 3],
        [4, 5],
      ]);
      expect(partition([1, 2], 2)).eql([[1, 2]]);
    });

    it("should still chunk array with n<=0", () => {
      expect(partition([1, 2, 3], 0)).eql([[1, 2, 3]]);
      expect(partition([1, 2, 3], -1)).eql([[1, 2, 3]]);
    });
  });

  /** @test {delay} */
  describe("#delay", () => {
    it("should delay resolution after the specified amount of time", () => {
      const start = new Date().getTime();
      return delay(10).then(() => {
        expect(new Date().getTime() - start).to.be.at.least(9);
      });
    });
  });

  /** @test {qsify} */
  describe("#qsify", () => {
    it("should generate a query string from an object", () => {
      expect(qsify({ a: 1, b: 2 })).eql("a=1&b=2");
    });

    it("should strip out undefined values", () => {
      expect(qsify({ a: undefined, b: 2 })).eql("b=2");
    });

    it("should join comma-separated values", () => {
      expect(qsify({ a: [1, 2], b: 2 })).eql("a=1,2&b=2");
    });

    it("should map boolean as lowercase string", () => {
      expect(qsify({ a: [true, 2], b: false })).eql("a=true,2&b=false");
    });

    it("should escaped values", () => {
      expect(qsify({ a: ["é", "ə"], b: "&" })).eql("a=%C3%A9,%C9%99&b=%26");
    });
  });

  /** @test {addEndpointOptions} */
  describe("#addEndpointOptions", () => {
    it("should add query options", () => {
      expect(addEndpointOptions("/a", { query: { a: '"123"' } })).eql(
        "/a?a=%22123%22"
      );
    });

    it("should understand _fields", () => {
      expect(addEndpointOptions("/a", { fields: ["a", "b"] })).eql(
        "/a?_fields=a,b"
      );
    });

    it("should not add ? if no options", () => {
      expect(addEndpointOptions("/a")).eql("/a");
    });
  });

  describe("#checkVersion", () => {
    it("should accept a version within provided range", () => {
      checkVersion("1.0", "1.0", "2.0");
      checkVersion("1.10", "1.0", "2.0");
      checkVersion("1.10", "1.9", "2.0");
      checkVersion("2.1", "1.0", "2.2");
      checkVersion("2.1", "1.2", "2.2");
      checkVersion("1.4", "1.4", "2.0");
    });

    it("should not accept a version oustide provided range", () => {
      expect(() => checkVersion("0.9", "1.0", "2.0")).to.Throw(Error);
      expect(() => checkVersion("2.0", "1.0", "2.0")).to.Throw(Error);
      expect(() => checkVersion("2.1", "1.0", "2.0")).to.Throw(Error);
      expect(() => checkVersion("3.9", "1.0", "2.10")).to.Throw(Error);
      expect(() => checkVersion("1.3", "1.4", "2.0")).to.Throw(Error);
    });
  });

  describe("@support", () => {
    it("should return a function", () => {
      expect(support("", "")).to.be.a("function");
    });

    it("should make decorated method resolve on version match", () => {
      class FakeClient {
        fetchHTTPApiVersion() {
          return Promise.resolve("1.4"); // simulates a successful checkVersion call
        }

        @support("1.0", "2.0")
        test() {
          return Promise.resolve();
        }
      }

      return new FakeClient().test();
    });

    it("should make decorated method rejecting on version mismatch", () => {
      class FakeClient {
        fetchHTTPApiVersion() {
          return Promise.resolve("1.4"); // simulates a failing checkVersion call
        }

        @support("1.5", "2.0")
        test() {
          return Promise.resolve();
        }
      }

      return new FakeClient().test().then(
        () => {
          throw new Error("Should be rejected");
        },
        (err) => {
          err.should.not.be.undefined;
        }
      );
    });

    it("should check for an attached client instance", () => {
      class FakeClient {
        // @ts-ignore
        private client: { fetchHTTPApiVersion: () => Promise<void> };
        constructor() {
          this.client = {
            fetchHTTPApiVersion() {
              return Promise.reject(); // simulates a failing checkVersion call
            },
          };
        }

        @support("", "")
        test() {
          return Promise.resolve();
        }
      }

      return new FakeClient().test().then(
        () => {
          throw new Error("Should be rejected");
        },
        (err) => {
          expect(err).to.be.undefined;
        }
      );
    });
  });

  describe("@capable", () => {
    it("should return a function", () => {
      expect(capable([])).to.be.a("function");
    });

    it("should make decorated method checking the capabilities", () => {
      class FakeClient {
        fetchServerCapabilities() {
          return Promise.resolve({}); // simulates a successful checkVersion call
        }

        @capable([])
        test() {
          return Promise.resolve();
        }
      }

      return new FakeClient().test();
    });

    it("should make decorated method resolve on capability match", () => {
      class FakeClient {
        fetchServerCapabilities() {
          return Promise.resolve({
            attachments: {},
            default: {},
            "auth:fxa": {},
          });
        }

        @capable(["default", "attachments"])
        test() {
          return Promise.resolve();
        }
      }

      return new FakeClient().test();
    });

    it("should make decorated method rejecting on missing capability", async () => {
      class FakeClient {
        fetchServerCapabilities() {
          return Promise.resolve({ attachments: {} });
        }

        @capable(["attachments", "default"])
        test() {
          return Promise.resolve();
        }
      }

      await expectAsyncError(
        () => new FakeClient().test(),
        /default not present/
      );
    });
  });

  describe("@nobatch", () => {
    it("should return a function", () => {
      expect(nobatch("")).to.be.a("function");
    });

    it("should make decorated method pass when not in batch", () => {
      class FakeClient {
        // @ts-ignore
        private _isBatch: boolean;
        constructor() {
          this._isBatch = false;
        }

        @nobatch("error")
        test() {
          return Promise.resolve();
        }
      }

      return new FakeClient().test();
    });

    it("should make decorated method to throw if in batch", () => {
      class FakeClient {
        // @ts-ignore
        private _isBatch: boolean;
        constructor() {
          this._isBatch = true;
        }

        @nobatch("error")
        test() {
          return Promise.resolve();
        }
      }

      expect(() => new FakeClient().test()).to.Throw(Error, "error");
    });
  });

  describe("parseDataURL()", () => {
    it("should extract expected properties", () => {
      expect(
        parseDataURL("data:image/png;encoding=utf-8;name=a.png;base64,b64")
      ).eql({
        type: "image/png",
        name: "a.png",
        base64: "b64",
        encoding: "utf-8",
      });
    });

    it("should support dataURL without name", () => {
      expect(parseDataURL("data:image/png;base64,b64")).eql({
        type: "image/png",
        base64: "b64",
      });
    });

    it("should throw an error when the data url is invalid", () => {
      expect(() => expect(parseDataURL("gni"))).to.throw(
        Error,
        "Invalid data-url: gni..."
      );
    });
  });

  describe("extractFileInfo()", () => {
    it("should extract file information from a data url", () => {
      const dataURL = "data:text/plain;name=t.txt;base64," + btoa("test");

      const { blob, name } = extractFileInfo(dataURL);

      if ("size" in blob) {
        expect(blob.size).eql(4);
      } else {
        // In Node, `blob` is actually a Buffer
        expect((blob as any).length).eql(4);
      }
      expect(name).eql("t.txt");
    });
  });

  describe("cleanUndefinedProperties()", () => {
    it("should remove undefined properties from an object", () => {
      const obj1 = cleanUndefinedProperties({ a: 1, b: undefined });
      /* eslint-disable no-prototype-builtins */
      expect(obj1.hasOwnProperty("a")).eql(true);
      expect(obj1.hasOwnProperty("b")).eql(false);
      /* eslint-enable no-prototype-builtins */
    });
  });
});
