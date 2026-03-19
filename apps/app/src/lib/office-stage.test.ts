import test from "node:test";
import assert from "node:assert/strict";

import { getOfficeStageClassName } from "./office-stage.ts";

test("office stage stays visible while dialogs are open", () => {
  assert.match(getOfficeStageClassName(false), /\bflex-1\b/);
  assert.doesNotMatch(getOfficeStageClassName(false), /\binvisible\b/);

  assert.match(getOfficeStageClassName(true), /\bpointer-events-none\b/);
  assert.doesNotMatch(getOfficeStageClassName(true), /\binvisible\b/);
});
