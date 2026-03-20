const test = require("node:test");
const assert = require("node:assert/strict");

const { createTunnelLogger, describeWebSocketClose } = require("./tunnel-log");

test("describeWebSocketClose includes code and reason when present", () => {
  assert.equal(
    describeWebSocketClose({ code: 1006, reason: "network_reset" }),
    "code=1006 reason=network_reset"
  );
});

test("describeWebSocketClose falls back when no details are available", () => {
  assert.equal(describeWebSocketClose({}), "no close details");
});

test("createTunnelLogger mirrors lines to console and appends a local tunnel log", () => {
  const writes = [];
  const consoleLines = [];

  const logger = createTunnelLogger({
    logPath: "/tmp/agentoffice-tunnel.log",
    now: () => "2026-03-20T08:12:00.000Z",
    mkdirSync: () => {},
    appendFileSync: (_path, content) => writes.push(content),
    consoleObj: {
      log: (line) => consoleLines.push(["log", line]),
      error: (line) => consoleLines.push(["error", line]),
    },
  });

  logger.info("connected to relay");
  logger.error("ws error: socket hang up");

  assert.deepEqual(consoleLines, [
    ["log", "[2026-03-20T08:12:00.000Z] [info] connected to relay"],
    ["error", "[2026-03-20T08:12:00.000Z] [error] ws error: socket hang up"],
  ]);
  assert.deepEqual(writes, [
    "[2026-03-20T08:12:00.000Z] [info] connected to relay\n",
    "[2026-03-20T08:12:00.000Z] [error] ws error: socket hang up\n",
  ]);
});
