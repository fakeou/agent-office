const test = require("node:test");
const assert = require("node:assert/strict");

const { toPublicSession } = require("./session-contract");

test("toPublicSession derives displayZone from displayState when zone is missing", () => {
  const session = toPublicSession({
    sessionId: "sess_3",
    provider: "codex",
    title: "Codex",
    command: "codex",
    cwd: process.cwd(),
    mode: "managed",
    transport: "tmux",
    state: "working",
    displayState: "approval",
    status: "running",
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:01.000Z",
    meta: {}
  });

  assert.equal(session.state, "working");
  assert.equal(session.displayState, "approval");
  assert.equal(session.displayZone, "approval-zone");
  assert.equal(session.lifecycle.displayZone, "approval-zone");
});
