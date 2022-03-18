import sinon from "sinon";
import { EventEmitter } from "events";
import mitt from "mitt";
import { fakeServerResponse, Stub, expectAsyncError } from "../test_utils";
import HTTP from "../../src/http/http";
import {
  NetworkTimeoutError,
  ServerResponse,
  UnparseableResponseError,
} from "../../src/http/errors";
import { Emitter } from "../../src/types";

const { expect } = intern.getPlugin("chai");
intern.getPlugin("chai").should();
const { describe, it, beforeEach, afterEach } =
  intern.getPlugin("interface.bdd");

/** @test {HTTP} */
describe("HTTP class", () => {
  function runSuite(label: string, emitter?: () => Emitter) {
    describe(label, () => {
      let sandbox: sinon.SinonSandbox, events: Emitter | undefined, http: HTTP;

      beforeEach(() => {
        sandbox = sinon.createSandbox();
        events = emitter ? emitter() : undefined;
        http = new HTTP(events, { timeout: 100 });
      });

      afterEach(() => sandbox.restore());

      /** @test {HTTP#constructor} */
      describe("#constructor", () => {
        it("should expose a passed events instance", () => {
          if (emitter) {
            const events = emitter();
            const http = new HTTP(events);
            expect(http.events).to.eql(events);
          }
        });

        it("should accept a requestMode option", () => {
          expect(
            new HTTP(events, {
              requestMode: "no-cors",
            }).requestMode
          ).eql("no-cors");
        });

        it("should not complain if an events handler is not provided", () => {
          expect(() => {
            new HTTP();
          }).not.to.Throw(Error, /No events handler provided/);
        });
      });

      /** @test {HTTP#request} */
      describe("#request()", () => {
        describe("Request headers", () => {
          let fetchStub: sinon.SinonStub;
          beforeEach(() => {
            fetchStub = sandbox
              .stub(http as any, "fetchFunc")
              .returns(fakeServerResponse(200, {}, {}));
          });

          it("should set default headers", () => {
            http.request("/");

            expect(fetchStub.firstCall.args[1].headers).eql(
              HTTP.DEFAULT_REQUEST_HEADERS
            );
          });

          it("should merge custom headers with default ones", () => {
            http.request("/", { headers: { Foo: "Bar" } });

            expect(fetchStub.firstCall.args[1].headers.Foo).eql("Bar");
          });

          it("should drop custom content-type header for multipart body", () => {
            http.request("/", {
              headers: { "Content-Type": "application/foo" },
              body: new FormData(),
            });

            expect(fetchStub.firstCall.args[1].headers["Content-Type"]).to.be
              .undefined;
          });
        });

        describe("Request CORS mode", () => {
          let fetchStub: sinon.SinonStub;

          it("should use default CORS mode", () => {
            const http = new HTTP(events);
            fetchStub = sandbox
              .stub(http as any, "fetchFunc")
              .returns(fakeServerResponse(200, {}, {}));

            http.request("/");

            expect(fetchStub.firstCall.args[1].mode).eql("cors");
          });

          it("should use configured custom CORS mode", () => {
            const http = new HTTP(events, { requestMode: "no-cors" });
            fetchStub = sandbox
              .stub(http as any, "fetchFunc")
              .returns(fakeServerResponse(200, {}, {}));

            http.request("/");

            expect(fetchStub.firstCall.args[1].mode).eql("no-cors");
          });
        });

        describe("Succesful request", () => {
          beforeEach(() => {
            sandbox
              .stub(http as any, "fetchFunc")
              .returns(fakeServerResponse(200, { a: 1 }, { b: 2 }));
          });

          it("should resolve with HTTP status", async () => {
            const { status } = await http.request("/");
            status.should.equal(200);
          });

          it("should resolve with JSON body", async () => {
            const { json } = await http.request("/");
            (json as { a: number }).should.deep.equal({ a: 1 });
          });

          it("should resolve with headers", async () => {
            const { headers } = await http.request("/");
            headers.get("b")!.should.equal("2");
          });
        });

        describe("Request timeout", () => {
          beforeEach(() => {
            sandbox.stub(http as any, "fetchFunc").returns(
              new Promise((resolve) => {
                setTimeout(resolve, 20000);
              })
            );
          });

          it("should timeout the request", async () => {
            await expectAsyncError(
              () => http.request("/"),
              undefined,
              NetworkTimeoutError
            );
          });

          it("should show request properties in error", async () => {
            await expectAsyncError(
              () =>
                http.request("/", {
                  mode: "cors",
                  headers: {
                    Authorization: "XXX",
                    "User-agent": "mocha-test",
                  },
                }),
              'Timeout while trying to access / with {"mode":"cors","headers":{"accept":"application/json","authorization":"**** (suppressed)","content-type":"application/json","user-agent":"mocha-test"}}'
            );
          });
        });

        describe("No content response", () => {
          it("should resolve with null JSON if Content-Length header is missing", async () => {
            sandbox
              .stub(http as any, "fetchFunc")
              .returns(fakeServerResponse(200, null, {}));

            const { json } = await http.request("/");
            expect(json).to.be.null;
          });
        });

        describe("Malformed JSON response", () => {
          it("should reject with an appropriate message", async () => {
            sandbox.stub(http as any, "fetchFunc").returns(
              Promise.resolve({
                status: 200,
                headers: {
                  get(name: string) {
                    if (name !== "Alert") {
                      return "fake";
                    }
                  },
                },
                text() {
                  return Promise.resolve("an example of invalid JSON");
                },
              })
            );

            await expectAsyncError(
              () => http.request("/"),
              /Response from server unparseable/,
              UnparseableResponseError
            );
          });
        });

        describe("Business error responses", () => {
          it("should reject on status code > 400", async () => {
            sandbox.stub(http as any, "fetchFunc").returns(
              fakeServerResponse(400, {
                code: 400,
                details: [
                  {
                    description: "data is missing",
                    location: "body",
                    name: "data",
                  },
                ],
                errno: 107,
                error: "Invalid parameters",
                message: "data is missing",
              })
            );

            await expectAsyncError(
              () => http.request("/"),
              /HTTP 400 Invalid parameters: Invalid request parameter \(data is missing\)/,
              ServerResponse
            );
          });

          it("should expose JSON error bodies", async () => {
            const errorBody = {
              code: 400,
              details: [
                {
                  description: "data is missing",
                  location: "body",
                  name: "data",
                },
              ],
              errno: 107,
              error: "Invalid parameters",
              message: "data is missing",
            };
            sandbox
              .stub(http as any, "fetchFunc")
              .returns(fakeServerResponse(400, errorBody));

            const error = await expectAsyncError(
              () => http.request("/"),
              undefined,
              ServerResponse
            );
            error.should.have.deep.property("data", errorBody);
          });

          it("should reject on status code > 400 even with empty body", async () => {
            sandbox.stub(http as any, "fetchFunc").resolves({
              status: 400,
              statusText: "Cake Is A Lie",
              headers: {
                get(name: string) {
                  if (name === "Content-Length") {
                    return 0;
                  }
                },
              },
              text() {
                return Promise.resolve("");
              },
            });

            await expectAsyncError(
              () => http.request("/"),
              /HTTP 400 Cake Is A Lie$/,
              ServerResponse
            );
          });
        });

        describe("Deprecation header", () => {
          const eolObject = {
            code: "soft-eol",
            url: "http://eos-url",
            message: "This service will soon be decommissioned",
          };

          let consoleWarnStub: Stub<typeof console.warn>;
          let eventsEmitStub: Stub<Emitter["emit"]> | null;

          beforeEach(() => {
            consoleWarnStub = sandbox.stub(console, "warn");
            eventsEmitStub = events ? sandbox.stub(events, "emit") : null;
          });

          it("should handle deprecation header", async () => {
            sandbox
              .stub(http as any, "fetchFunc")
              .returns(
                fakeServerResponse(
                  200,
                  {},
                  { Alert: JSON.stringify(eolObject) }
                )
              );

            await http.request("/");
            sinon.assert.calledOnce(consoleWarnStub);
            sinon.assert.calledWithExactly(
              consoleWarnStub,
              eolObject.message,
              eolObject.url
            );
          });

          it("should handle deprecation header parse error", async () => {
            sandbox
              .stub(http as any, "fetchFunc")
              .returns(fakeServerResponse(200, {}, { Alert: "dafuq" }));

            await http.request("/");
            sinon.assert.calledOnce(consoleWarnStub);
            sinon.assert.calledWithExactly(
              consoleWarnStub,
              "Unable to parse Alert header message",
              "dafuq"
            );
          });

          it("should emit a deprecated event on Alert header", async () => {
            sandbox
              .stub(http as any, "fetchFunc")
              .returns(
                fakeServerResponse(
                  200,
                  {},
                  { Alert: JSON.stringify(eolObject) }
                )
              );

            await http.request("/");
            if (events && eventsEmitStub) {
              expect(eventsEmitStub.firstCall.args[0]).eql("deprecated");
              expect(eventsEmitStub.firstCall.args[1]).eql(eolObject);
            }
          });
        });

        describe("Backoff header handling", () => {
          let eventsEmitStub: Stub<Emitter["emit"]> | null;
          beforeEach(() => {
            // Make Date#getTime always returning 1000000, for predictability
            sandbox.stub(Date.prototype, "getTime").returns(1000 * 1000);
            eventsEmitStub = events ? sandbox.stub(events, "emit") : null;
          });

          it("should emit a backoff event on set Backoff header", async () => {
            sandbox
              .stub(http as any, "fetchFunc")
              .returns(fakeServerResponse(200, {}, { Backoff: "1000" }));

            await http.request("/");
            if (events && eventsEmitStub) {
              expect(eventsEmitStub.firstCall.args[0]).eql("backoff");
              expect(eventsEmitStub.firstCall.args[1]).eql(2000000);
            }
          });

          it("should emit a backoff event even on error responses", async () => {
            sandbox
              .stub(http as any, "fetchFunc")
              .returns(fakeServerResponse(503, {}, { Backoff: "1000" }));

            try {
              await http.request("/");
            } catch (err) {}
            if (events && eventsEmitStub) {
              expect(eventsEmitStub.firstCall.args[0]).eql("backoff");
              expect(eventsEmitStub.firstCall.args[1]).eql(2000000);
            }
          });

          it("should emit a backoff event on missing Backoff header", async () => {
            sandbox
              .stub(http as any, "fetchFunc")
              .returns(fakeServerResponse(200, {}, {}));

            await http.request("/");
            if (events && eventsEmitStub) {
              expect(eventsEmitStub.firstCall.args[0]).eql("backoff");
              expect(eventsEmitStub.firstCall.args[1]).eql(0);
            }
          });
        });

        describe("Retry-After header handling", () => {
          let eventsEmitStub: Stub<Emitter["emit"]> | null;
          describe("Event", () => {
            beforeEach(() => {
              // Make Date#getTime always returning 1000000, for predictability
              sandbox.stub(Date.prototype, "getTime").returns(1000 * 1000);
              eventsEmitStub = events ? sandbox.stub(events, "emit") : null;
            });

            it("should emit a retry-after event when Retry-After is set", async () => {
              sandbox
                .stub(http as any, "fetchFunc")
                .returns(
                  fakeServerResponse(200, {}, { "Retry-After": "1000" })
                );

              await http.request("/", {}, { retry: 0 });
              if (events && eventsEmitStub) {
                expect(eventsEmitStub.lastCall.args[0]).eql("retry-after");
                expect(eventsEmitStub.lastCall.args[1]).eql(2000000);
              }
            });
          });

          describe("Retry loop", () => {
            let fetch: sinon.SinonStub;

            beforeEach(() => {
              fetch = sandbox.stub(http as any, "fetchFunc");
            });

            it("should not retry the request by default", async () => {
              fetch.returns(
                fakeServerResponse(503, {}, { "Retry-After": "1" })
              );

              await expectAsyncError(() => http.request("/"), /HTTP 503/);
            });

            it("should retry the request if specified", async () => {
              const success = { success: true };
              fetch
                .onCall(0)
                .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));
              fetch.onCall(1).returns(fakeServerResponse(200, success));

              const { json } = await http.request("/", {}, { retry: 1 });
              (json as { success: boolean }).should.deep.equal(success);
            });

            it("should error when retries are exhausted", async () => {
              fetch
                .onCall(0)
                .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));
              fetch
                .onCall(1)
                .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));
              fetch
                .onCall(2)
                .returns(fakeServerResponse(503, {}, { "Retry-After": "1" }));

              await expectAsyncError(
                () => http.request("/", {}, { retry: 2 }),
                /HTTP 503/
              );
            });
          });
        });
      });
    });
  }

  runSuite("with EventEmitter", () => new EventEmitter());
  runSuite("with mitt", () => mitt());
  runSuite("without EventEmitter");
});
