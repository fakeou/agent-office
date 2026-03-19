import test from "node:test";
import assert from "node:assert/strict";

import { getRouteNavMode } from "./route-nav.ts";

test("office and dashboard use the floating menu button", () => {
  assert.equal(getRouteNavMode("/office"), "menu");
  assert.equal(getRouteNavMode("/dashboard"), "menu");
});

test("terminal routes do not use the floating route nav control", () => {
  assert.equal(getRouteNavMode("/terminal/sess_123"), "none");
});

test("auth routes do not show the floating route nav control", () => {
  assert.equal(getRouteNavMode("/auth"), "none");
});
