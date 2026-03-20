import test from "node:test";
import assert from "node:assert/strict";

import {
  EVENTS_FIRST_MESSAGE_TIMEOUT_MS,
  RELAY_EVENTS_KEEPALIVE_INTERVAL_MS,
  getEventsSocketClosePatch,
  getEventsSocketOpenPatch,
} from "./events-socket.ts";

test("events socket open immediately proves relay tunnel is online", () => {
  assert.deepEqual(getEventsSocketOpenPatch(), {
    connected: true,
    relayOnline: true,
    error: null,
  });
});

test("events socket first-message timeout waits beyond relay keepalive", () => {
  assert.equal(
    EVENTS_FIRST_MESSAGE_TIMEOUT_MS > RELAY_EVENTS_KEEPALIVE_INTERVAL_MS,
    true,
  );
});

test("tunnel offline close clears relayOnline immediately", () => {
  assert.deepEqual(getEventsSocketClosePatch({ code: 4502, reason: "tunnel_offline" }), {
    connected: false,
    relayOnline: false,
  });
});
