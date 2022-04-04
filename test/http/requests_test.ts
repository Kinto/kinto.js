import { btoa } from "../test_utils";
import * as requests from "../../src/http/requests";

const { expect } = intern.getPlugin("chai");
intern.getPlugin("chai").should();
const { describe, it } = intern.getPlugin("interface.bdd");

describe("requests module", () => {
  describe("createRequest()", () => {
    it("should return a POST creation request", () => {
      expect(requests.createRequest("/foo", {})).eql({
        body: {
          data: undefined,
          permissions: undefined,
        },
        headers: {},
        method: "POST",
        path: "/foo",
      });
    });

    it("should return a PUT creation request when an id is provided", () => {
      expect(
        requests.createRequest("/foo", {
          data: { id: "foo" },
        })
      ).eql({
        body: {
          data: {
            id: "foo",
          },
          permissions: undefined,
        },
        headers: {},
        method: "PUT",
        path: "/foo",
      });
    });

    it("should accept a headers option", () => {
      expect(requests.createRequest("/foo", {}, { headers: { Foo: "Bar" } }))
        .to.have.property("headers")
        .eql({ Foo: "Bar" });
    });

    it("should accept a permissions option", () => {
      const permissions = { read: ["github:n1k0"] };
      expect(requests.createRequest("/foo", { permissions }))
        .to.have.property("body")
        .to.have.property("permissions")
        .eql(permissions);
    });

    it("should support a safe option", () => {
      expect(
        requests.createRequest("/foo", { data: { id: "foo" } }, { safe: true })
      )
        .to.have.property("headers")
        .to.have.property("If-None-Match")
        .eql("*");
    });
  });

  describe("deleteRequest()", () => {
    it("should return a deletion request", () => {
      expect(requests.deleteRequest("/foo")).eql({
        headers: {},
        method: "DELETE",
        path: "/foo",
      });
    });

    it("should accept a headers option", () => {
      expect(requests.deleteRequest("/foo", { headers: { Foo: "Bar" } }))
        .to.have.property("headers")
        .eql({ Foo: "Bar" });
    });

    it("should raise for safe with no last_modified passed", () => {
      expect(() => requests.deleteRequest("/foo", { safe: true })).to.Throw(
        Error,
        /requires a last_modified/
      );
    });

    it("should support a safe option with a last_modified option", () => {
      expect(requests.deleteRequest("/foo", { safe: true, last_modified: 42 }))
        .to.have.property("headers")
        .to.have.property("If-Match")
        .eql('"42"');
    });
  });

  describe("updateRequest()", () => {
    it("should return a update request", () => {
      expect(
        requests.updateRequest("/foo", {
          data: { id: "foo", age: 42 },
        })
      ).eql({
        body: {
          data: { id: "foo", age: 42 },
          permissions: undefined,
        },
        headers: {},
        method: "PUT",
        path: "/foo",
      });
    });

    it("should accept a headers option", () => {
      expect(
        requests.updateRequest(
          "/foo",
          { data: { id: "foo" } },
          { headers: { Foo: "Bar" } }
        )
      )
        .to.have.property("headers")
        .eql({ Foo: "Bar" });
    });

    it("should accept a permissions option", () => {
      const permissions = { read: ["github:n1k0"] };
      expect(
        requests.updateRequest("/foo", {
          data: { id: "foo" },
          permissions,
        })
      )
        .to.have.property("body")
        .to.have.property("permissions")
        .eql(permissions);
    });

    it("should accept a patch option", () => {
      expect(
        requests.updateRequest("/foo", { data: { id: "foo" } }, { patch: true })
      )
        .to.have.property("method")
        .eql("PATCH");
    });

    it("should handle data", () => {
      expect(requests.updateRequest("/foo", { data: { id: "foo", a: 1 } }))
        .to.have.property("body")
        .to.have.property("data")
        .eql({ id: "foo", a: 1 });
    });

    it("should support a safe option with no last_modified passed", () => {
      expect(
        requests.updateRequest(
          "/foo",
          { data: { id: "foo", a: 1 } },
          { safe: true }
        )
      )
        .to.have.property("headers")
        .to.have.property("If-None-Match")
        .eql("*");
    });

    it("should support a safe option with a last_modified passed", () => {
      expect(
        requests.updateRequest(
          "/foo",
          { data: { id: "foo", last_modified: 42 } },
          { safe: true }
        )
      )
        .to.have.property("headers")
        .to.have.property("If-Match")
        .eql('"42"');
    });
  });

  it("should accept a patch option", () => {
    expect(
      requests.updateRequest(
        "/foo",
        { data: { id: "foo", last_modified: 42 } },
        { patch: true }
      )
    )
      .to.have.property("method")
      .eql("PATCH");
  });

  describe("addAttachmentRequest()", () => {
    const dataURL = "data:text/plain;name=test.txt;base64," + btoa("hola");
    it("should return a post request", () => {
      expect(requests.addAttachmentRequest("/foo", dataURL))
        .to.have.property("method")
        .eql("POST");
    });

    it("should accept a headers option", () => {
      expect(
        requests.addAttachmentRequest(
          "/foo",
          dataURL,
          {},
          { headers: { Foo: "Bar" } }
        )
      )
        .to.have.property("headers")
        .eql({ Foo: "Bar" });
    });

    it("should support a safe with no last_modified passed", () => {
      expect(requests.addAttachmentRequest("/foo", dataURL, {}, { safe: true }))
        .to.have.property("headers")
        .to.have.property("If-None-Match")
        .eql("*");
    });

    it("should support a safe option with a last_modified option", () => {
      expect(
        requests.addAttachmentRequest(
          "/foo",
          dataURL,
          {},
          { safe: true, last_modified: 42 }
        )
      )
        .to.have.property("headers")
        .to.have.property("If-Match")
        .eql('"42"');
    });

    it("should support a gzipped option passed with true", () => {
      expect(
        requests.addAttachmentRequest("/foo", dataURL, {}, { gzipped: true })
      )
        .to.have.property("path")
        .eql("/foo?gzipped=true");
    });

    it("should support a gzipped option passed with false", () => {
      expect(
        requests.addAttachmentRequest("/foo", dataURL, {}, { gzipped: false })
      )
        .to.have.property("path")
        .eql("/foo?gzipped=false");
    });
  });
});
