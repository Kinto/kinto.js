"use strict";

import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import jsdom from "jsdom";
import httpServer from "http-server";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

function createDemoServer() {
  const server = httpServer.createServer({
    root: "demo",
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": "true"
    }
  });
  server.listen(8080);
  return server;
}

function createBrowser() {
  return new Promise((resolve, reject) => {
    jsdom.env({
      url: "http://0.0.0.0:8080/",
      features: {
        FetchExternalResources: ["script"],
        ProcessExternalResources: ["script"],
      },
      done: function(errors, window) {
        if (!errors)
          return resolve(window);
        return reject(new Error("Browser: " + errors.map(e => e.message).join("; ")));
      }
    });
  });
}

describe("Functional tests", () => {
  var demoServer, browser;

  beforeEach(() => {
    demoServer = createDemoServer();
    return createBrowser()
      .then(b => browser = b);
  });

  it("description", () => {
    // body...
  });
});
