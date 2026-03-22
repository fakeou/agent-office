import test from "node:test";
import assert from "node:assert/strict";

import {
  getDirectoryBrowserFetchTarget,
  shouldOpenDirectoryBrowserOnLaunchDialogOpen,
} from "./office-launch.ts";

test("launch dialog keeps the directory browser closed by default", () => {
  assert.equal(shouldOpenDirectoryBrowserOnLaunchDialogOpen(), false);
});

test("directory browser fetches the typed path when opening from a different folder", () => {
  assert.equal(
    getDirectoryBrowserFetchTarget({
      launchCwd: "/Users/mac/Desktop",
      currentDir: "/Users/mac/Documents",
    }),
    "/Users/mac/Desktop",
  );
});

test("directory browser reuses the current folder when the typed path already matches it", () => {
  assert.equal(
    getDirectoryBrowserFetchTarget({
      launchCwd: "/Users/mac/Documents",
      currentDir: "/Users/mac/Documents",
    }),
    undefined,
  );
});

test("directory browser falls back to home fetch when nothing is loaded yet", () => {
  assert.equal(
    getDirectoryBrowserFetchTarget({
      launchCwd: "   ",
      currentDir: "",
    }),
    "",
  );
});
