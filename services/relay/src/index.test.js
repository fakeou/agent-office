const test = require("node:test");
const assert = require("node:assert/strict");

const { createRelayServer } = require("./index");

async function withRelayServer(run) {
  const relay = createRelayServer({
    port: 0,
    host: "127.0.0.1",
    verifyKey: async () => null,
  });

  await new Promise((resolve) => relay.server.once("listening", resolve));

  try {
    const address = relay.server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      relay.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

test("relay CORS allows native app origins for Capacitor fetches", async () => {
  await withRelayServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/relay/health`, {
      headers: {
        Origin: "capacitor://localhost",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "capacitor://localhost");
    assert.match(response.headers.get("vary") || "", /Origin/);
  });
});

test("relay CORS answers OPTIONS preflight for https localhost app shells", async () => {
  await withRelayServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ws-token`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://localhost",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://localhost");
    assert.match(response.headers.get("access-control-allow-methods") || "", /POST/);
    assert.match(response.headers.get("access-control-allow-headers") || "", /Authorization/);
  });
});
