# Codex State Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Codex `approval` and `attention` survive transcript linking and reach the Game UI through `displayState`/`displayZone`.

**Architecture:** Keep lifecycle state and presentation state separate. Transcript reconciliation remains responsible for stable lifecycle transitions, while runtime output adds presentation overlays for `approval` and `attention`. The CLI runtime and Game UI both switch to treating `displayState` as the user-visible authority. Because this repo has mirrored core logic in `packages/core/src` and `packages/cli/src/core`, the implementation updates both copies in the same commit.

**Tech Stack:** Node.js 18+, CommonJS modules, `node:test`, tmux-backed CLI runtime, React app event bridge, Godot GDScript office scene

---

## File Map

- Modify: `packages/cli/src/core/providers/codex.js`
- Modify: `packages/core/src/providers/codex.js`
- Modify: `packages/cli/src/runtime/pty-manager.js`
- Modify: `apps/game-frontend/srcipt/main.gd`
- Modify: `packages/cli/src/core/store/session-store.js`
- Modify: `packages/core/src/store/session-store.js`
- Modify: `packages/cli/src/core/session-contract.js`
- Modify: `packages/core/src/session-contract.js`
- Create: `packages/cli/src/core/providers/codex.test.js`
- Create: `packages/cli/src/core/store/session-store.test.js`
- Optional Create: `packages/core/src/providers/codex.test.js`
- Optional Create: `packages/core/src/store/session-store.test.js`

Notes:

- The runtime executes `packages/cli/src/core/*`, so tests must at least cover that tree.
- `packages/core/src/*` is still a public mirror and should stay behaviorally aligned.
- There is no existing Jest/Vitest setup; use `node --test` with focused CommonJS tests.

### Task 1: Lock In Overlay Semantics With Failing Tests

**Files:**
- Create: `packages/cli/src/core/providers/codex.test.js`
- Create: `packages/cli/src/core/store/session-store.test.js`
- Optional Create: `packages/core/src/providers/codex.test.js`
- Optional Create: `packages/core/src/store/session-store.test.js`

- [ ] **Step 1: Write the failing provider test for transcript lifecycle plus overlay preservation**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { CodexProvider } = require("./codex");

test("reconcileSession keeps lifecycle working while allowing approval display overlay", () => {
  // session starts with an overlay already active
  // transcript reconciliation should not erase the overlay
  assert.equal(result.state, "working");
  assert.equal(result.patch.displayState, "approval");
});
```

- [ ] **Step 2: Write the failing store test for lifecycle state plus display override**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSessionStore } = require("./session-store");

test("setSessionState keeps lifecycle state and applies displayState override", () => {
  const store = createSessionStore();
  store.upsertSession({ sessionId: "sess_1", provider: "codex", state: "idle" });
  const next = store.setSessionState("sess_1", "working", {
    displayState: "approval",
    displayZone: "approval-zone",
    status: "running"
  });
  assert.equal(next.state, "working");
  assert.equal(next.displayState, "approval");
  assert.equal(next.displayZone, "approval-zone");
});
```

- [ ] **Step 3: Add a failing provider test for text classification after transcript linking**

```js
test("classifyOutput can still raise attention for transcript-backed sessions", () => {
  const provider = new CodexProvider();
  const session = { meta: { codexSessionPath: "/tmp/mock.jsonl" } };
  const nextState = provider.classifyOutput("network error: connection timeout", session);
  assert.equal(nextState, "attention");
});
```

- [ ] **Step 4: Run the tests to verify they fail for the current behavior**

Run: `node --test packages/cli/src/core/providers/codex.test.js packages/cli/src/core/store/session-store.test.js`  
Expected: FAIL because the current provider/store contract does not yet preserve overlays through transcript reconciliation.

- [ ] **Step 5: Commit the red tests**

```bash
git add packages/cli/src/core/providers/codex.test.js packages/cli/src/core/store/session-store.test.js
git commit -m "test: capture Codex overlay state regressions"
```

### Task 2: Teach Codex Reconciliation To Merge Lifecycle And Overlay State

**Files:**
- Modify: `packages/cli/src/core/providers/codex.js`
- Modify: `packages/core/src/providers/codex.js`

- [ ] **Step 1: Add a small helper that derives overlay patch metadata from the current session**

```js
function activeOverlayPatch(session) {
  if (!session || !["approval", "attention"].includes(session.displayState)) {
    return null;
  }
  return {
    displayState: session.displayState,
    displayZone: session.displayZone,
    meta: {
      overlayState: session.displayState,
      overlayUpdatedAt: session.updatedAt || null
    }
  };
}
```

- [ ] **Step 2: Update `classifyOutput` to accept session context and return provider-specific overlay states only**

```js
classifyOutput(chunk, session) {
  const text = String(chunk).toLowerCase();
  if (text.includes("press enter") || text.includes("confirm")) return "approval";
  if (text.includes("network error") || text.includes("timed out") || text.includes("failed")) return "attention";
  return null;
}
```

- [ ] **Step 3: Update `reconcileSession` so transcript lifecycle updates do not erase an active overlay**

```js
return {
  session: metaChanged ? { meta: nextMeta } : null,
  state: summary.state,
  patch: summary.state
    ? {
        status: "running",
        ...(overlay ? {
          displayState: overlay.displayState,
          displayZone: overlay.displayZone
        } : {})
      }
    : null,
  eventName,
  meta: lifecycleAdvanced ? { ...eventMeta, ...(overlay ? overlay.meta : {}) } : overlay?.meta || null
};
```

- [ ] **Step 4: Add an explicit clear path when new transcript lifecycle evidence proves recovery**

```js
if (summary.state === "idle" && session.displayState === "attention") {
  patch.displayState = "idle";
  patch.displayZone = "idle-zone";
}
```

- [ ] **Step 5: Mirror the same logic into `packages/core/src/providers/codex.js`**

Run: `diff -u packages/cli/src/core/providers/codex.js packages/core/src/providers/codex.js`  
Expected: no unintended drift beyond known path differences.

- [ ] **Step 6: Run the focused provider test**

Run: `node --test packages/cli/src/core/providers/codex.test.js`  
Expected: PASS

- [ ] **Step 7: Commit the provider merge behavior**

```bash
git add packages/cli/src/core/providers/codex.js packages/core/src/providers/codex.js packages/cli/src/core/providers/codex.test.js
git commit -m "fix: preserve Codex approval and attention overlays"
```

### Task 3: Restore Runtime Classification Without Reintroducing Flicker

**Files:**
- Modify: `packages/cli/src/runtime/pty-manager.js`
- Modify: `packages/cli/src/core/store/session-store.js`
- Modify: `packages/core/src/store/session-store.js`
- Modify: `packages/cli/src/core/session-contract.js`
- Modify: `packages/core/src/session-contract.js`

- [ ] **Step 1: Add a failing regression test for state plus display override if Task 1 did not already cover it**

```js
test("runtime-driven displayState override survives lifecycle update", () => {
  // set working + approval overlay, then apply transcript lifecycle update
  // displayState should still be approval until explicit recovery
});
```

- [ ] **Step 2: Change the tmux polling loop to keep calling `classifyOutput` after transcript linking**

```js
const screen = await capturePane(runtime.tmuxSession);
const overlayState = runtime.provider.classifyOutput(screen, store.getSession(session.sessionId));
if (overlayState && overlayState !== session.displayState) {
  store.setSessionState(session.sessionId, session.state || "working", {
    status: "running",
    displayState: overlayState,
    displayZone: displayZoneFor(overlayState)
  });
}
```

- [ ] **Step 3: Keep the transcript reconcile call after classification so lifecycle remains fresh**

Run: `sed -n '320,390p' packages/cli/src/runtime/pty-manager.js`  
Expected: the code classifies the screen and still applies transcript reconciliation every poll cycle.

- [ ] **Step 4: Tighten the store/session contract semantics only if needed**

```js
// state remains lifecycle
// displayState/displayZone may differ from state
assert.equal(toPublicSession(session).displayState, "approval");
assert.equal(toPublicSession(session).state, "working");
```

- [ ] **Step 5: Mirror any required store/contract changes into `packages/core/src/*`**

Run: `diff -u packages/cli/src/core/store/session-store.js packages/core/src/store/session-store.js`  
Expected: no unintended drift beyond deliberate mirrored edits.

- [ ] **Step 6: Run the focused runtime/state tests**

Run: `node --test packages/cli/src/core/store/session-store.test.js packages/cli/src/core/providers/codex.test.js`  
Expected: PASS

- [ ] **Step 7: Commit the runtime merge fix**

```bash
git add packages/cli/src/runtime/pty-manager.js packages/cli/src/core/store/session-store.js packages/core/src/store/session-store.js packages/cli/src/core/session-contract.js packages/core/src/session-contract.js packages/cli/src/core/store/session-store.test.js
git commit -m "fix: merge Codex transcript lifecycle with runtime overlays"
```

### Task 4: Make The Game UI Read The Correct State Authority

**Files:**
- Modify: `apps/game-frontend/srcipt/main.gd`

- [ ] **Step 1: Add a small state picker helper near the snapshot parsing path**

```gdscript
func _session_display_state(session: Dictionary) -> String:
	return _normalize_state(str(session.get("displayState", session.get("state", session.get("status", STATE_IDLE)))))
```

- [ ] **Step 2: Replace direct `state/status` lookups in snapshot and single-worker updates**

```gdscript
var next_state: String = _session_display_state(session)
```

- [ ] **Step 3: Extend indicator logic so `attention` gets an explicit visual branch**

```gdscript
match actor.state:
	STATE_APPROVAL:
		# show approval bubble
	STATE_ATTENTION:
		# show attention bubble
	_:
		# hide bubble
```

- [ ] **Step 4: Confirm zone movement still uses the resolved worker state**

Run: `rg -n "_resolve_zone_for_state|_sync_worker_state_indicator|displayState" apps/game-frontend/srcipt/main.gd`  
Expected: snapshot ingestion and indicator logic both route through `displayState`.

- [ ] **Step 5: Perform a lightweight static smoke check**

Run: `git diff -- apps/game-frontend/srcipt/main.gd`  
Expected: only the state read order and indicator handling changed.

- [ ] **Step 6: Commit the Game UI contract fix**

```bash
git add apps/game-frontend/srcipt/main.gd
git commit -m "fix: drive game workers from display state"
```

### Task 5: Verify End-To-End Behavior And Document Follow-Ups

**Files:**
- Modify: `docs/PROJECT_NOTES.md`
- Optional Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Run the focused automated tests together**

Run: `node --test packages/cli/src/core/providers/codex.test.js packages/cli/src/core/store/session-store.test.js`  
Expected: PASS

- [ ] **Step 2: Run a local smoke scenario if Codex CLI is available**

Run: `node packages/cli/src/index.js codex -t "Print hello and wait for approval"`  
Expected: local session reaches `displayState=approval` when the runtime sees an approval prompt.

- [ ] **Step 3: Inspect session payload output instead of relying on UI confirmation**

Run: `curl -s http://127.0.0.1:8787/api/sessions | jq '.sessions[] | {sessionId, state, displayState, displayZone, status}'`  
Expected: a transcript-backed Codex session can report `state: "working"` with `displayState: "approval"` or `displayState: "attention"`.

- [ ] **Step 4: Record any remaining Claude parity and latency follow-ups**

```md
- Claude should adopt the same overlay contract
- relay/tunnel latency remains a separate optimization track
```

- [ ] **Step 5: Commit the verification/docs updates**

```bash
git add docs/PROJECT_NOTES.md docs/ROADMAP.md
git commit -m "docs: note overlay state contract and follow-ups"
```
