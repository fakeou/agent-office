import test from "node:test";
import assert from "node:assert/strict";

import {
  getFloatingRouteNavLayerClass,
  getRouteNavMode,
} from "./route-nav.ts";

test("office and dashboard use the floating menu button", () => {
  assert.equal(getRouteNavMode("/office"), "menu");
  assert.equal(getRouteNavMode("/dashboard"), "menu");
});

test("terminal routes use the floating back button", () => {
  assert.equal(getRouteNavMode("/terminal/sess_123"), "back");
});

test("auth routes do not show the floating route nav control", () => {
  assert.equal(getRouteNavMode("/auth"), "none");
});

test("terminal overlays raise the floating back button above the modal layer", () => {
  assert.equal(getFloatingRouteNavLayerClass(true), "z-[60]");
  assert.equal(getFloatingRouteNavLayerClass(false), "z-40");
});
