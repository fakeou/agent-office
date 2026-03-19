import test from "node:test";
import assert from "node:assert/strict";

import {
  formatLaunchError,
  getParentDirectory,
  shouldShowOfficeHeaderText,
} from "./office-launch.ts";

test("launch error explains when the connected computer is offline", () => {
  assert.match(formatLaunchError("tunnel_offline"), /offline/i);
  assert.match(formatLaunchError("tunnel_offline"), /ato start/i);
});

test("office header text is hidden on mobile platforms", () => {
  assert.equal(shouldShowOfficeHeaderText("android"), false);
  assert.equal(shouldShowOfficeHeaderText("ios"), false);
  assert.equal(shouldShowOfficeHeaderText("web"), true);
});

test("directory browser can move up one level", () => {
  assert.equal(getParentDirectory("/Users/mac/Documents/work"), "/Users/mac/Documents");
  assert.equal(getParentDirectory("/Users"), "/");
  assert.equal(getParentDirectory("/"), "/");
  assert.equal(getParentDirectory("workspace"), "");
  assert.equal(getParentDirectory(""), "");
});
