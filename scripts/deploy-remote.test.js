const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const rootDir = path.resolve(__dirname, "..");

test("root package.json allows required native builds under pnpm 10", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const onlyBuiltDependencies = packageJson.pnpm && packageJson.pnpm.onlyBuiltDependencies;

  assert.ok(Array.isArray(onlyBuiltDependencies), "pnpm.onlyBuiltDependencies must be an array");
  assert.ok(onlyBuiltDependencies.includes("better-sqlite3"));
  assert.ok(onlyBuiltDependencies.includes("node-pty"));
  assert.ok(onlyBuiltDependencies.includes("esbuild"));
});

test("remote deploy script exists and covers the production deployment flow", () => {
  const scriptPath = path.join(rootDir, "scripts/deploy-remote.sh");

  assert.equal(fs.existsSync(scriptPath), true, "scripts/deploy-remote.sh must exist");

  const script = fs.readFileSync(scriptPath, "utf8");

  assert.match(script, /root@agentoffice\.top/);
  assert.match(script, /\/opt\/agentoffice/);
  assert.match(script, /git fetch --tags origin main/);
  assert.match(script, /pnpm install --frozen-lockfile/);
  assert.match(script, /python3\.11/);
  assert.match(script, /npm_config_python/);
  assert.match(script, /pnpm --filter @agent-office\/app build/);
  assert.match(script, /pnpm rebuild better-sqlite3 node-pty esbuild/);
  assert.match(script, /systemctl restart agentoffice-api\.service agentoffice-relay\.service/);
  assert.match(script, /curl -fsS http:\/\/127\.0\.0\.1:9000\/api\/relay\/health/);
  assert.match(script, /curl -fsS http:\/\/127\.0\.0\.1:9001\/api\/health/);
});
