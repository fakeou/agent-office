import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("button forwards refs for Radix asChild triggers", () => {
  const source = readFileSync(new URL("./button.tsx", import.meta.url), "utf8");

  assert.match(source, /React\.forwardRef</);
  assert.match(source, /ref={ref}/);
});
