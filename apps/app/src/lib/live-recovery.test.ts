import test from "node:test";
import assert from "node:assert/strict";

import { platformRecoveryMessage, shouldReplaceSocketOnResume } from "./live-recovery.ts";

test("resume replaces an apparently open socket when it is stale", () => {
  assert.equal(
    shouldReplaceSocketOnResume({
      readyState: WebSocket.OPEN,
      lastMessageAt: Date.now() - 5000,
      staleAfterMs: 1500,
    }),
    true,
  );
});

test("resume keeps a fresh open socket", () => {
  assert.equal(
    shouldReplaceSocketOnResume({
      readyState: WebSocket.OPEN,
      lastMessageAt: Date.now() - 250,
      staleAfterMs: 1500,
    }),
    false,
  );
});

test("platform guidance calls out stricter iOS background limits", () => {
  assert.match(platformRecoveryMessage("ios"), /iOS/i);
  assert.match(platformRecoveryMessage("ios"), /push/i);
});

test("platform guidance tells Android users foreground recovery is the fast path", () => {
  assert.match(platformRecoveryMessage("android"), /Android/i);
  assert.match(platformRecoveryMessage("android"), /foreground/i);
});
