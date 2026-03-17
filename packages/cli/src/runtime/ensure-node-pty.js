const fs = require("node:fs");
const path = require("node:path");

function ensureExecutable(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const mode = stats.mode & 0o777;
    if ((mode & 0o111) === 0o111) {
      return false;
    }
    fs.chmodSync(filePath, mode | 0o755);
    return true;
  } catch {
    return false;
  }
}

function ensureNodePtySpawnHelper() {
  let packageJsonPath;
  try {
    packageJsonPath = require.resolve("node-pty/package.json");
  } catch {
    return { changed: [], checked: [] };
  }

  const packageRoot = path.dirname(packageJsonPath);
  const targets = [
    path.join(packageRoot, "prebuilds", "darwin-arm64", "spawn-helper"),
    path.join(packageRoot, "prebuilds", "darwin-x64", "spawn-helper")
  ];

  const checked = [];
  const changed = [];
  for (const target of targets) {
    checked.push(target);
    if (!fs.existsSync(target)) {
      continue;
    }
    if (ensureExecutable(target)) {
      changed.push(target);
    }
  }

  return { changed, checked };
}

module.exports = {
  ensureNodePtySpawnHelper
};
