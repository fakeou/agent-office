const { spawnSync, spawn } = require("node:child_process");
const crypto = require("node:crypto");
const pty = require("node-pty");

const AGENTTOWN_TMUX_PREFIX = "agenttown_";

function tmuxPath() {
  return process.env.TMUX_BIN || "tmux";
}

function runTmux(args, options = {}) {
  return spawnSync(tmuxPath(), args, {
    encoding: "utf8",
    ...options
  });
}

function assertTmuxOk(result, action) {
  if (result.status === 0) {
    return;
  }
  const message = (result.stderr || result.stdout || `${action} failed`).trim();
  throw new Error(`tmux ${action} failed: ${message}`);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function createTmuxSession({ sessionName, cwd, command, shell }) {
  // Clean env: remove CLAUDECODE to prevent "nested session" detection
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  const createResult = runTmux(["new-session", "-d", "-s", sessionName, "-c", cwd], {
    env: cleanEnv
  });
  assertTmuxOk(createResult, "new-session");

  const remainResult = runTmux(["set-option", "-t", sessionName, "remain-on-exit", "on"]);
  assertTmuxOk(remainResult, "set-option remain-on-exit");

  const launchCommand = `exec ${shell} -lc ${shellQuote(command)}`;
  const sendLiteralResult = runTmux(["send-keys", "-t", `${sessionName}:0.0`, "-l", launchCommand]);
  assertTmuxOk(sendLiteralResult, "send-keys literal");

  const sendEnterResult = runTmux(["send-keys", "-t", `${sessionName}:0.0`, "Enter"]);
  assertTmuxOk(sendEnterResult, "send-keys enter");
}

function listSessions() {
  const result = runTmux(["list-sessions", "-F", "#{session_name}"]);
  if (result.status !== 0) {
    return [];
  }
  return (result.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function listAgentTownSessions() {
  return listSessions().filter((sessionName) => sessionName.startsWith(AGENTTOWN_TMUX_PREFIX));
}

function sessionExists(sessionName) {
  const result = runTmux(["has-session", "-t", sessionName]);
  return result.status === 0;
}

function killSession(sessionName) {
  const result = runTmux(["kill-session", "-t", sessionName]);
  if (result.status !== 0) {
    return false;
  }
  return true;
}

function describePane(sessionName) {
  const result = runTmux([
    "list-panes",
    "-t",
    sessionName,
    "-F",
    "#{pane_pid}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_current_command}"
  ]);

  if (result.status !== 0) {
    return null;
  }

  const line = (result.stdout || "").trim().split("\n")[0];
  if (!line) {
    return null;
  }

  const [pidText, deadText, deadStatusText, currentCommand] = line.split("\t");
  return {
    pid: Number(pidText || 0) || null,
    dead: deadText === "1",
    deadStatus: deadStatusText === "" ? null : Number(deadStatusText),
    currentCommand: currentCommand || null
  };
}

function capturePane(sessionName) {
  return new Promise((resolve) => {
    const proc = spawn(tmuxPath(), ["capture-pane", "-p", "-e", "-J", "-t", `${sessionName}:0.0`]);
    let stdout = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.on("close", (code) => { resolve(code === 0 ? stdout : ""); });
    proc.on("error", () => { resolve(""); });
  });
}

function attachClient(sessionName, { cwd, cols = 120, rows = 32 } = {}) {
  // Create a linked session that shares the same window group but with status bar
  // disabled, so the tmux chrome does not leak into the xterm.js stream.
  const webSession = `${sessionName}_wv_${crypto.randomBytes(3).toString("hex")}`;

  const proc = pty.spawn(tmuxPath(), [
    "new-session", "-t", sessionName, "-s", webSession,
    ";", "set-option", "status", "off"
  ], {
    name: "xterm-256color",
    cwd: cwd || process.cwd(),
    env: process.env,
    cols,
    rows
  });

  // Expose the linked session name so callers can clean it up on disconnect.
  proc.webTmuxSession = webSession;
  return proc;
}

function localAttachCommand(sessionName) {
  return `${tmuxPath()} attach-session -t ${sessionName}`;
}

module.exports = {
  AGENTTOWN_TMUX_PREFIX,
  attachClient,
  capturePane,
  createTmuxSession,
  describePane,
  killSession,
  listAgentTownSessions,
  localAttachCommand,
  sessionExists,
  tmuxPath
};
