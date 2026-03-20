const test = require("node:test");
const assert = require("node:assert/strict");

const { buildLocalRequestHeaders } = require("./tunnel");

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
