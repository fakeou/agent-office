import test from "node:test";
import assert from "node:assert/strict";

import { resolveOfficeConnected } from "./office-connection.ts";

test("office is offline when relay events stay connected but the hosted tunnel is offline", () => {
  assert.equal(
    resolveOfficeConnected({
      eventsConnected: true,
      relayOnline: false,
    }),
    false,
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
