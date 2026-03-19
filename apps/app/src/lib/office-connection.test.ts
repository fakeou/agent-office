import test from "node:test";
import assert from "node:assert/strict";

import { resolveOfficeConnected } from "./office-connection.ts";

test("office stays live when relay events are connected even if relay status lags behind", () => {
  assert.equal(
    resolveOfficeConnected({
      eventsConnected: true,
      relayOnline: false,
    }),
    true,
  );
});

test("office is live only when both relay events and hosted tunnel are online", () => {
  assert.equal(
    resolveOfficeConnected({
      eventsConnected: true,
      relayOnline: true,
    }),
    true,
  );
});

test("office is offline when neither relay events nor relay status are online", () => {
  assert.equal(
    resolveOfficeConnected({
      eventsConnected: false,
      relayOnline: false,
    }),
    false,
  );
});
