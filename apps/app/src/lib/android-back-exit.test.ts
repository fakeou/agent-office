import test from "node:test";
import assert from "node:assert/strict";

import {
  getOfficeBackExitOutcome,
  isAndroidUserAgent,
} from "./android-back-exit.ts";

test("android platform detection only matches Android user agents", () => {
  assert.equal(isAndroidUserAgent("Mozilla/5.0 (Linux; Android 15; Pixel 9)"), true);
  assert.equal(isAndroidUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), false);
});

test("first office back press shows a hint and arms the exit window", () => {
  assert.deepEqual(
    getOfficeBackExitOutcome({ now: 1_000, armedUntil: 0, windowMs: 2_000 }),
    {
      shouldExit: false,
      showHint: true,
      armedUntil: 3_000,
    },
  );
});

test("second office back press within the timeout exits the app", () => {
  assert.deepEqual(
    getOfficeBackExitOutcome({ now: 2_000, armedUntil: 3_000, windowMs: 2_000 }),
    {
      shouldExit: true,
      showHint: false,
      armedUntil: 0,
    },
  );
});
