const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

test("root postinstall points at the live ensure-node-pty module", () => {
  const rootDir = path.resolve(__dirname, "../../../../");
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const postinstall = packageJson.scripts && packageJson.scripts.postinstall;

  assert.match(postinstall, /packages\/cli\/src\/runtime\/ensure-node-pty/);
});

test("service packages no longer depend on @agent-office/core", () => {
  const rootDir = path.resolve(__dirname, "../../../../");
  const apiPackageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "services/api/package.json"), "utf8"));
  const relayPackageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "services/relay/package.json"), "utf8"));

  assert.ok(!("@agent-office/core" in (apiPackageJson.dependencies || {})));
  assert.ok(!("@agent-office/core" in (relayPackageJson.dependencies || {})));
});

test("legacy packages/core package has been removed", () => {
  const rootDir = path.resolve(__dirname, "../../../../");
  assert.equal(fs.existsSync(path.join(rootDir, "packages/core")), false);
});
