import test from "node:test";
import assert from "node:assert/strict";

import {
  MOBILE_TERMINAL_KEYS,
  applyInputDataToBuffer,
  buildDraftSyncSequence,
} from "./terminal-input.ts";

test("mobile terminal key list removes ctrl+d", () => {
  assert.equal(MOBILE_TERMINAL_KEYS.some((key) => key.label === "Ctrl+D"), false);
});

test("draft sync erases the stale line before writing the new text", () => {
  assert.equal(buildDraftSyncSequence("hello", "hi"), "\x7f\x7f\x7f\x7f\x7fhi");
});

test("draft sync is empty when nothing changed", () => {
  assert.equal(buildDraftSyncSequence("same", "same"), "");
});

test("local input buffer tracks printable characters and clears on submit", () => {
  let buffer = "";
  buffer = applyInputDataToBuffer(buffer, "n");
  buffer = applyInputDataToBuffer(buffer, "p");
  buffer = applyInputDataToBuffer(buffer, "m");
  assert.equal(buffer, "npm");

  buffer = applyInputDataToBuffer(buffer, "\r");
  assert.equal(buffer, "");
});

test("local input buffer applies backspace and ctrl+c without opening a new line", () => {
  let buffer = "codex";
  buffer = applyInputDataToBuffer(buffer, "\x7f");
  assert.equal(buffer, "code");

  buffer = applyInputDataToBuffer(buffer, "\x03");
  assert.equal(buffer, "");
});
