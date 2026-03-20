const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { CodexProvider } = require("./codex");

function writeTranscriptFile(entries) {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), "codex-transcript-"));
  const filePath = path.join(dirPath, "session.jsonl");
  fs.writeFileSync(
    filePath,
    `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8"
  );
  return filePath;
}

test("reconcileSession keeps approval display overlay when transcript advances to working", () => {
  const transcriptPath = writeTranscriptFile([
    {
      type: "session_meta",
      payload: {
        id: "codex-session-1",
        cwd: process.cwd(),
        timestamp: "2026-03-18T10:00:00.000Z"
      }
    },
    {
      timestamp: "2026-03-18T10:00:01.000Z",
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-1"
      }
    }
  ]);

  const provider = new CodexProvider();
  const session = provider.createSession({
    cwd: process.cwd(),
    title: "Codex",
    command: "codex",
    meta: {
      codexSessionPath: transcriptPath,
      codexTranscriptCursor: null,
      codexLastLifecycle: null
    }
  });
  session.status = "running";
  session.state = "working";
  session.displayState = "approval";
  session.displayZone = "approval-zone";
  session.updatedAt = "2026-03-18T10:00:02.000Z";

  const result = provider.reconcileSession(session, { sessions: [session] });

  assert.ok(result);
  assert.equal(result.state, "working");
  assert.equal(result.patch.displayState, "approval");
  assert.equal(result.patch.displayZone, "approval-zone");
});

test("classifyOutput can raise attention for transcript-backed sessions", () => {
  const provider = new CodexProvider();
  const nextState = provider.classifyOutput("network error: connection timed out", {
    meta: {
      codexSessionPath: "/tmp/mock-codex.jsonl"
    }
  });

  assert.equal(nextState, "attention");
});

test("classifyOutput treats user interrupted Codex screens as idle", () => {
  const provider = new CodexProvider();
  const nextState = provider.classifyOutput(
    "Conversation interrupted - tell the model what to do differently. Something went wrong? Hit `/feedback` to report the issue."
  );

  assert.equal(nextState, "idle");
});

test("classifyOutput treats stream disconnects as attention", () => {
  const provider = new CodexProvider();
  const nextState = provider.classifyOutput(
    "stream disconnected before completion: error sending request for url (http://54.255.64.152:3000/openai/responses)"
  );

  assert.equal(nextState, "attention");
});

test("classifyOutput ignores diagnostic text that only mentions attention patterns", () => {
  const provider = new CodexProvider();
  const nextState = provider.classifyOutput(
    [
      'rg -n -i "conversation interrupted|error sending request for url|network error|timed out|failed to send request|failed to submit|panic|fetch failed"',
      'const nextState = provider.classifyOutput("network error: connection timed out", { meta: { codexSessionPath: "/tmp/mock-codex.jsonl" } });',
      'The changelog says stream disconnected before completion should surface as attention.'
    ].join("\n")
  );

  assert.equal(nextState, null);
});

test("classifyOutput does not treat plain explanatory approval text as a real approval prompt", () => {
  const provider = new CodexProvider();
  const nextState = provider.classifyOutput(
    "只有真实审批提示才归到 approval"
  );

  assert.equal(nextState, null);
});

test("classifyOutput recognizes real Codex approval prompts", () => {
  const provider = new CodexProvider();
  const nextState = provider.classifyOutput(
    "Approval requested: Codex wants to edit files"
  );

  assert.equal(nextState, "approval");
});

test("getOverlayDisplayPatch clears stale attention overlays back to the lifecycle state", () => {
  const provider = new CodexProvider();
  const patch = provider.getOverlayDisplayPatch(
    {
      state: "working",
      displayState: "attention",
      displayZone: "attention-zone"
    },
    null
  );

  assert.deepEqual(patch, {
    displayState: "working",
    displayZone: "working-zone"
  });
});
