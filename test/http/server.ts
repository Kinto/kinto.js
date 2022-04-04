import { KintoProxyServer } from "kinto-node-test-server";

function willRunBrowserTests() {
  const { environments } = intern.config;
  for (const env of environments) {
    if (env.browserName !== "node") {
      return true;
    }
  }

  return false;
}

let server: KintoProxyServer = null;

intern.on("runStart", async () => {
  if (willRunBrowserTests()) {
    server = new KintoProxyServer();
    await server.startServer();
  }
});

intern.on("runEnd", async () => {
  if (server) {
    await server.stopServer();
  }
});
