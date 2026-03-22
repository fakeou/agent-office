const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createServer } = require("node:http");
const { WebSocketServer } = require("ws");

const { buildLocalRequestHeaders, createTunnelClient } = require("./tunnel");

test("buildLocalRequestHeaders strips browser-only proxy headers and rewrites host", () => {
  const next = buildLocalRequestHeaders(
    {
      authorization: "Bearer token",
      accept: "*/*",
      "content-type": "application/json",
      host: "agentoffice.top",
      connection: "keep-alive",
      "accept-encoding": "gzip, deflate, br, zstd",
      "content-length": "123",
      origin: "https://agentoffice.top",
      referer: "https://agentoffice.top/office",
      "sec-ch-ua": "\"Chromium\";v=\"146\"",
      "sec-fetch-mode": "cors",
      "x-forwarded-for": "203.0.113.10"
    },
    "http://127.0.0.1:8765"
  );

  assert.deepEqual(next, {
    authorization: "Bearer token",
    accept: "*/*",
    "content-type": "application/json",
    host: "127.0.0.1:8765"
  });
});

async function withRelaySocketServer(run) {
  const server = createServer();
  const wss = new WebSocketServer({ server });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const relayUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ relayUrl, wss });
  } finally {
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function createNoopLogger() {
  return {
    info() {},
    error() {}
  };
}

async function waitFor(predicate, timeoutMs = 500) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return true;
}

test("createTunnelClient reconnects when auth never completes", async () => {
  await withRelaySocketServer(async ({ relayUrl, wss }) => {
    const connections = [];
    wss.on("connection", (socket) => {
      connections.push(socket);
      socket.on("message", () => {
        // Intentionally ignore auth messages to simulate a stalled handshake.
      });
    });

    const tunnel = createTunnelClient({
      key: "test-key",
      relayUrl,
      localServerUrl: "http://127.0.0.1:8765",
      logger: createNoopLogger(),
      reconnectBaseMs: 20,
      reconnectMaxMs: 40,
      authResponseTimeoutMs: 50,
      watchdogIntervalMs: 10
    });

    try {
      const reconnected = await waitFor(() => connections.length >= 2);
      assert.ok(reconnected, `expected reconnect after stalled auth, saw ${connections.length} connection(s)`);
    } finally {
      tunnel.stop();
    }
  });
});

test("createTunnelClient reconnects when an authenticated tunnel goes silent", async () => {
  await withRelaySocketServer(async ({ relayUrl, wss }) => {
    const connections = [];
    wss.on("connection", (socket) => {
      connections.push(socket);
      socket.once("message", () => {
        socket.send(JSON.stringify({ type: "auth:ok", userId: "user_test" }));
        // Intentionally stay silent after auth: no ping, no messages.
      });
    });

    const tunnel = createTunnelClient({
      key: "test-key",
      relayUrl,
      localServerUrl: "http://127.0.0.1:8765",
      logger: createNoopLogger(),
      reconnectBaseMs: 20,
      reconnectMaxMs: 40,
      staleUpstreamTimeoutMs: 60,
      watchdogIntervalMs: 10
    });

    try {
      const reconnected = await waitFor(() => connections.length >= 2);
      assert.ok(reconnected, `expected reconnect after stale upstream, saw ${connections.length} connection(s)`);
    } finally {
      tunnel.stop();
    }
  });
});

test("createTunnelClient retries after relay auth timeout closes the socket", async () => {
  await withRelaySocketServer(async ({ relayUrl, wss }) => {
    const connections = [];
    wss.on("connection", (socket) => {
      connections.push(socket);
      socket.once("message", () => {
        socket.close(4401, "auth_timeout");
      });
    });

    const tunnel = createTunnelClient({
      key: "test-key",
      relayUrl,
      localServerUrl: "http://127.0.0.1:8765",
      logger: createNoopLogger(),
      reconnectBaseMs: 20,
      reconnectMaxMs: 40,
      watchdogIntervalMs: 10
    });

    try {
      const reconnected = await waitFor(() => connections.length >= 2);
      assert.ok(reconnected, `expected reconnect after auth_timeout, saw ${connections.length} connection(s)`);
    } finally {
      tunnel.stop();
    }
  });
});

test("createTunnelClient stops retrying after invalid key is rejected", async () => {
  await withRelaySocketServer(async ({ relayUrl, wss }) => {
    const connections = [];
    wss.on("connection", (socket) => {
      connections.push(socket);
      socket.once("message", () => {
        socket.send(JSON.stringify({ type: "auth:error", error: "invalid_key" }));
        socket.close(4401, "invalid_key");
      });
    });

    const tunnel = createTunnelClient({
      key: "test-key",
      relayUrl,
      localServerUrl: "http://127.0.0.1:8765",
      logger: createNoopLogger(),
      reconnectBaseMs: 20,
      reconnectMaxMs: 40,
      watchdogIntervalMs: 10
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(connections.length, 1);
    } finally {
      tunnel.stop();
    }
  });
});
