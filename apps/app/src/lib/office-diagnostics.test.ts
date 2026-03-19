import test from "node:test";
import assert from "node:assert/strict";

import { getOfficeDiagnosticsRows } from "./office-diagnostics.ts";

test("office diagnostics only shows websocket and relay tunnel rows", () => {
  assert.deepEqual(
    getOfficeDiagnosticsRows({
      connected: true,
      relayOnline: false,
    }),
    [
      {
        key: "events",
        label: "Events WebSocket",
        ok: true,
        hint: "WebSocket dropped. Tap Retry to reconnect.",
      },
      {
        key: "relay-tunnel",
        label: "Relay -> CLI Tunnel",
        ok: false,
        hint: "Run ato start on your computer to connect the tunnel.",
      },
    ],
  );
});
