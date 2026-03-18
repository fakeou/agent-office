import test from "node:test";
import assert from "node:assert/strict";

import {
  INITIAL_EVENTS_RECONNECT_STATE,
  getEventsReconnectStateOnClose,
  getEventsReconnectStateOnOpen,
} from "./events-recovery.ts";

test("tunnel offline enters upstream-wait recovery mode with a fast retry", () => {
  const next = getEventsReconnectStateOnClose(INITIAL_EVENTS_RECONNECT_STATE, {
    code: 4502,
    reason: "tunnel_offline",
  });

  assert.deepEqual(next, {
    delayMs: 1000,
    mode: "waiting_for_upstream",
  });
});

test("upstream-wait mode stays on fast retries across handshake failures", () => {
  const waiting = getEventsReconnectStateOnClose(INITIAL_EVENTS_RECONNECT_STATE, {
    code: 4502,
    reason: "tunnel_offline",
  });

  const next = getEventsReconnectStateOnClose(waiting, {
    code: 1006,
    reason: "",
  });

  assert.deepEqual(next, {
    delayMs: 1000,
    mode: "waiting_for_upstream",
  });
});

test("a healthy open resets reconnect state back to normal backoff", () => {
  const waiting = getEventsReconnectStateOnClose(INITIAL_EVENTS_RECONNECT_STATE, {
    code: 4502,
    reason: "tunnel_offline",
  });

  const reopened = getEventsReconnectStateOnOpen(waiting);
  const next = getEventsReconnectStateOnClose(reopened, {
    code: 1006,
    reason: "",
  });

  assert.deepEqual(reopened, {
    delayMs: 1000,
    mode: "default",
  });
  assert.deepEqual(next, {
    delayMs: 2000,
    mode: "default",
  });
});
