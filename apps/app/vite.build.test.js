import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const appDir = path.dirname(new URL(import.meta.url).pathname);

test("vite build copies Godot export into the requested outDir", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-office-app-build-"));
  const outDir = path.join(tempRoot, "dist-custom");

  try {
    execFileSync(
      "pnpm",
      ["exec", "vite", "build", "--outDir", outDir, "--emptyOutDir"],
      {
        cwd: appDir,
        stdio: "pipe",
      },
    );

    const builtIndexPath = path.join(outDir, "index.html");
    const builtGodotIndexPath = path.join(outDir, "godot", "index.html");

    assert.equal(fs.existsSync(builtIndexPath), true, "main app index should exist in the custom outDir");
    assert.equal(fs.existsSync(builtGodotIndexPath), true, "Godot export should exist in the custom outDir");

    const godotHtml = fs.readFileSync(builtGodotIndexPath, "utf8");
    assert.match(godotHtml, /agent-office-map/i);
    assert.doesNotMatch(godotHtml, /React SPA shell for AgentOffice/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
