const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { printClaudeHooksConfig } = require("@agenttown/core");

function commandExists(command) {
  const result = spawnSync("/usr/bin/env", ["bash", "-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`]);
  return result.status === 0;
}

function resolveCommand(command) {
  const result = spawnSync("/usr/bin/env", ["bash", "-lc", `command -v ${JSON.stringify(command)}`], { encoding: "utf8" });
  if (result.status !== 0) {
    return null;
  }
  return (result.stdout || "").trim() || null;
}

function networkUrls({ host, port }) {
  const urls = [];
  if (host === "0.0.0.0") {
    urls.push(`http://127.0.0.1:${port}`);
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
      for (const entry of entries || []) {
        if (!entry || entry.family !== "IPv4" || entry.internal) {
          continue;
        }
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  } else {
    urls.push(`http://${host}:${port}`);
  }
  return [...new Set(urls)];
}

function claudeSettingsPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function hasClaudeHookConfig({ serverUrl, handlerPath }) {
  const settings = readJson(claudeSettingsPath());
  if (!settings || !settings.hooks) {
    return false;
  }
  const expected = printClaudeHooksConfig({ serverUrl, handlerPath });
  const hookEvent = expected.hooks && expected.hooks.SessionStart;
  const actualEvent = settings.hooks && settings.hooks.SessionStart;
  if (!hookEvent || !actualEvent) {
    return false;
  }
  const expectedCommand = hookEvent[0] && hookEvent[0].hooks && hookEvent[0].hooks[0] && hookEvent[0].hooks[0].command;
  const actualCommand = actualEvent[0] && actualEvent[0].hooks && actualEvent[0].hooks[0] && actualEvent[0].hooks[0].command;
  return Boolean(expectedCommand && actualCommand && expectedCommand === actualCommand);
}

function applyClaudeHookConfig({ serverUrl, handlerPath }) {
  const filePath = claudeSettingsPath();
  const nextHooks = printClaudeHooksConfig({ serverUrl, handlerPath }).hooks;
  const current = readJson(filePath) || {};
  const next = {
    ...current,
    hooks: {
      ...(current.hooks || {}),
      ...nextHooks
    }
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return filePath;
}

module.exports = {
  applyClaudeHookConfig,
  claudeSettingsPath,
  commandExists,
  hasClaudeHookConfig,
  networkUrls,
  resolveCommand
};
