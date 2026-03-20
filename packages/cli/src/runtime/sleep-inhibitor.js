const { spawn } = require("node:child_process");

function startSleepInhibitor({
  pid = process.pid,
  platform = process.platform,
  commandExists = () => true,
  spawn: spawnProcess = spawn
} = {}) {
  if (platform !== "darwin") {
    return { started: false, reason: "unsupported_platform" };
  }

  if (!commandExists("caffeinate")) {
    return { started: false, reason: "missing_command" };
  }

  const child = spawnProcess("caffeinate", ["-dimsu", "-w", String(pid)], {
    stdio: "ignore"
  });
  child.unref?.();

  return {
    started: true,
    reason: "started",
    child
  };
}

module.exports = {
  startSleepInhibitor
};
