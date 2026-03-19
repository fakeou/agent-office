import test from "node:test";
import assert from "node:assert/strict";

import { getOfficeDiagnosticsRows } from "./office-diagnostics.ts";

test("connected websocket marks every confirmed upstream hop live", () => {
  assert.deepEqual(
    getOfficeDiagnosticsRows({
      connected: true,
      relayOnline: false,
      relayReachable: false,
    }),
    [
      {
        key: "browser-relay",
        label: "Browser -> Relay",
        state: "ok",
        hint: "Your browser can reach the hosted relay.",
      },
      {
        key: "relay-tunnel",
        label: "Relay -> Local Tunnel",
        state: "ok",
        hint: "Your connected computer is attached to the relay tunnel.",
      },
      {
        key: "events",
        label: "Events WebSocket",
        state: "ok",
        hint: "Live session events are streaming normally.",
      },
    ],
  );
});

test("browser relay failure marks downstream tunnel as unknown", () => {
  assert.deepEqual(
    getOfficeDiagnosticsRows({
      connected: false,
      relayOnline: true,
      relayReachable: false,
    }),
    [
      {
        key: "browser-relay",
        label: "Browser -> Relay",
        state: "offline",
        hint: "The relay is unreachable from this browser right now.",
      },
      {
        key: "relay-tunnel",
        label: "Relay -> Local Tunnel",
        state: "unknown",
        hint: "Tunnel status is unavailable until the browser can reach the relay.",
      },
      {
        key: "events",
        label: "Events WebSocket",
        state: "offline",
        hint: "Live events are disconnected. Tap Retry to reconnect.",
      },
    ],
  );
});

test("reachable relay with offline tunnel isolates the local tunnel problem", () => {
  assert.deepEqual(
    getOfficeDiagnosticsRows({
      connected: false,
      relayOnline: false,
      relayReachable: true,
    }),
    [
      {
        key: "browser-relay",
        label: "Browser -> Relay",
        state: "ok",
        hint: "Your browser can reach the hosted relay.",
      },
      {
        key: "relay-tunnel",
        label: "Relay -> Local Tunnel",
        state: "offline",
        hint: "Run ato start on your computer to reconnect the local tunnel.",
      },
      {
        key: "events",
        label: "Events WebSocket",
        state: "offline",
        hint: "Live events are disconnected. Tap Retry to reconnect.",
      },
    ],
  );
});

test("initial diagnostics show relay reachability as checking", () => {
  assert.deepEqual(
    getOfficeDiagnosticsRows({
      connected: false,
      relayOnline: false,
      relayReachable: null,
    }),
    [
      {
        key: "browser-relay",
        label: "Browser -> Relay",
        state: "checking",
        hint: "Checking whether this browser can reach the relay...",
      },
      {
        key: "relay-tunnel",
        label: "Relay -> Local Tunnel",
        state: "unknown",
        hint: "Tunnel status will appear after relay reachability is confirmed.",
      },
      {
        key: "events",
        label: "Events WebSocket",
        state: "offline",
        hint: "Live events are disconnected. Tap Retry to reconnect.",
      },
    ],
  );
});
