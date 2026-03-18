const test = require("node:test");
const assert = require("node:assert/strict");

const { createSessionStore } = require("./session-store");

test("setSessionState keeps lifecycle state and applies display override", () => {
  const store = createSessionStore();
  store.upsertSession({
    sessionId: "sess_1",
    provider: "codex",
    title: "Codex",
    command: "codex",
    cwd: process.cwd(),
    state: "idle",
    status: "running"
  });

  const next = store.setSessionState("sess_1", "working", {
    status: "running",
    displayState: "approval",
    displayZone: "approval-zone"
  });

  assert.equal(next.state, "working");
  assert.equal(next.displayState, "approval");
  assert.equal(next.displayZone, "approval-zone");
  assert.equal(next.status, "running");
});

test("setSessionState derives displayZone from displayState override when zone is omitted", () => {
  const store = createSessionStore();
  store.upsertSession({
    sessionId: "sess_2",
    provider: "codex",
    title: "Codex",
    command: "codex",
    cwd: process.cwd(),
    state: "idle",
    status: "running"
  });

  const next = store.setSessionState("sess_2", "working", {
    status: "running",
    displayState: "attention"
  });

  assert.equal(next.state, "working");
  assert.equal(next.displayState, "attention");
  assert.equal(next.displayZone, "attention-zone");
});
