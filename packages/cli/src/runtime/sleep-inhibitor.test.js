const test = require("node:test");
const assert = require("node:assert/strict");

const { startSleepInhibitor } = require("./sleep-inhibitor");

test("startSleepInhibitor starts caffeinate by default on macOS", () => {
  const calls = [];
  const child = {
    unrefCalled: false,
    unref() {
      this.unrefCalled = true;
    }
  };

  const result = startSleepInhibitor({
    pid: 4321,
    platform: "darwin",
    commandExists: (command) => command === "caffeinate",
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return child;
    }
  });

  assert.deepEqual(calls, [
    {
      command: "caffeinate",
      args: ["-dimsu", "-w", "4321"],
      options: { stdio: "ignore" }
    }
  ]);
  assert.equal(child.unrefCalled, true);
  assert.equal(result.started, true);
  assert.equal(result.reason, "started");
});

test("startSleepInhibitor skips non-macOS platforms", () => {
  const result = startSleepInhibitor({
    pid: 4321,
    platform: "linux",
    commandExists: () => true,
    spawn: () => {
      throw new Error("spawn should not be called");
    }
  });

  assert.equal(result.started, false);
  assert.equal(result.reason, "unsupported_platform");
});

test("startSleepInhibitor skips when caffeinate is unavailable", () => {
  const result = startSleepInhibitor({
    pid: 4321,
    platform: "darwin",
    commandExists: () => false,
    spawn: () => {
      throw new Error("spawn should not be called");
    }
  });

  assert.equal(result.started, false);
  assert.equal(result.reason, "missing_command");
});
