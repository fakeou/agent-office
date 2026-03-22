import test from "node:test";
import assert from "node:assert/strict";

import {
  formatLaunchError,
  getDirectoryBrowseQuery,
  getDirectoryBrowserPath,
  getDirectorySuggestionQuery,
  getMatchingDirectoryOptions,
  getDirectoryOptionLabel,
  getOfficePageViewportHeight,
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

test("directory browser path prefers the live folder, then typed path, then home", () => {
  assert.equal(
    getDirectoryBrowserPath({
      currentDir: "/Users/mac/Documents",
      launchCwd: "/Users/mac/Desktop",
      homedir: "/Users/mac",
    }),
    "/Users/mac/Documents",
  );

  assert.equal(
    getDirectoryBrowserPath({
      currentDir: "",
      launchCwd: "/Users/mac/Desktop",
      homedir: "/Users/mac",
    }),
    "/Users/mac/Desktop",
  );

  assert.equal(
    getDirectoryBrowserPath({
      currentDir: "",
      launchCwd: "   ",
      homedir: "/Users/mac",
    }),
    "/Users/mac",
  );
});

test("directory browser options show readable folder labels", () => {
  assert.equal(getDirectoryOptionLabel("/Users/mac/Documents/work"), "work");
  assert.equal(getDirectoryOptionLabel("/Users/mac/Documents/work/"), "work");
  assert.equal(getDirectoryOptionLabel("/"), "/");
});

test("directory suggestions fetch the parent folder and keep the typed fragment as filter", () => {
  assert.deepEqual(
    getDirectorySuggestionQuery({
      launchCwd: "/Users/mac/Doc",
      currentDir: "/Users/mac/Desktop",
      homedir: "/Users/mac",
    }),
    {
      fetchPath: "/Users/mac",
      filterText: "Doc",
    },
  );

  assert.deepEqual(
    getDirectorySuggestionQuery({
      launchCwd: "/Users/mac/Documents/",
      currentDir: "",
      homedir: "/Users/mac",
    }),
    {
      fetchPath: "/Users/mac/Documents",
      filterText: "",
    },
  );
});

test("directory browse query opens the current folder children from the arrow toggle", () => {
  assert.deepEqual(
    getDirectoryBrowseQuery({
      launchCwd: "/Users/mac/Documents",
      currentDir: "",
      homedir: "/Users/mac",
    }),
    {
      fetchPath: "/Users/mac/Documents",
      fallbackPath: "/Users/mac",
      filterText: "",
    },
  );

  assert.deepEqual(
    getDirectoryBrowseQuery({
      launchCwd: "/Users/mac/Doc",
      currentDir: "",
      homedir: "/Users/mac",
    }),
    {
      fetchPath: "/Users/mac/Doc",
      fallbackPath: "/Users/mac",
      filterText: "",
    },
  );
});

test("directory matches prioritize prefix matches and hide unrelated folders", () => {
  assert.deepEqual(
    getMatchingDirectoryOptions(
      [
        "/Users/mac/Documents",
        "/Users/mac/Downloads",
        "/Users/mac/Desktop",
        "/Users/mac/Pictures",
      ],
      "Do",
    ),
    [
      "/Users/mac/Documents",
      "/Users/mac/Downloads",
    ],
  );

  assert.deepEqual(
    getMatchingDirectoryOptions(
      [
        "/Users/mac/Documents",
        "/Users/mac/Downloads",
      ],
      "",
    ),
    [
      "/Users/mac/Documents",
      "/Users/mac/Downloads",
    ],
  );
});

test("office page height accounts for the global safe-area padding once", () => {
  assert.equal(
    getOfficePageViewportHeight(),
    "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
  );
});
