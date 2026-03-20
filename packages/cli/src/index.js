#!/usr/bin/env node

try {
  process.loadEnvFile?.();
} catch {}

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createAppServer } = require("./server");
const {
  createSessionStore,
  printClaudeHooksConfig,
  DEFAULT_LAN_HOST,
  DEFAULT_PORT,
  DEFAULT_SERVER_URL
} = require("./core");
const {
  createPtyManager,
  defaultTransportForProvider,
  ensureNodePtySpawnHelper,
  startSleepInhibitor,
  listSessionRecords,
  removeSessionRecord,
  applyClaudeHookConfig,
  commandExists,
  hasClaudeHookConfig,
  networkUrls,
  resolveCommand,
  listAgentOfficeSessions,
  killSession,
  tmuxPath
} = require("./runtime");
const { createTunnelClient } = require("./tunnel");

const DEFAULT_RELAY_URL = "https://agentoffice.top";

function readEnvValue(name) {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveHostedOptions(options) {
  const optionKey = typeof options.key === "string" ? options.key.trim() : "";
  const optionRelay = typeof options.relay === "string" ? options.relay.trim() : "";

  return {
    key: optionKey || readEnvValue("AGENTOFFICE_API_KEY"),
    relayUrl: optionRelay || readEnvValue("AGENTOFFICE_RELAY_URL") || DEFAULT_RELAY_URL,
    keySource: optionKey ? "--key" : readEnvValue("AGENTOFFICE_API_KEY") ? "AGENTOFFICE_API_KEY" : null,
    relaySource: optionRelay ? "--relay" : readEnvValue("AGENTOFFICE_RELAY_URL") ? "AGENTOFFICE_RELAY_URL" : "default"
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const action = args.shift() || "start";
  let subaction = null;
  const options = {};
  const commandParts = [];
  let commandMode = false;

  if (args[0] && !args[0].startsWith("-") && args[0] !== "--") {
    subaction = args.shift();
  }

  while (args.length > 0) {
    const token = args.shift();
    if (commandMode) {
      commandParts.push(token);
      continue;
    }
    if (token === "--") {
      if (action !== "run") {
        continue;
      }
      commandMode = true;
      continue;
    }
    if (token === "-t") {
      options.title = args.shift();
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = args[0];
      if (!next || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = args.shift();
      }
      continue;
    }
    commandParts.push(token);
  }

  return { action, subaction, options, command: commandParts.join(" ").trim() };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json();
}

async function resolveAttachTarget({ target, server }) {
  if (!target) {
    return null;
  }

  if (target.startsWith("agentoffice_")) {
    return target;
  }

  const record = listSessionRecords().find((entry) => entry.sessionId === target);
  if (record && record.meta && record.meta.tmuxSession) {
    return record.meta.tmuxSession;
  }

  try {
    const response = await fetch(`${server}/api/sessions/${encodeURIComponent(target)}`);
    if (response.ok) {
      const session = await response.json();
      if (session && session.meta && session.meta.tmuxSession) {
        return session.meta.tmuxSession;
      }
    }
  } catch {
    // Ignore server lookup failures and fall back to local registry only.
  }

  return null;
}

async function main() {
  const { action, subaction, options, command } = parseArgs(process.argv);

  if (action === "start") {
    const nodePtySetup = ensureNodePtySpawnHelper();
    if (nodePtySetup.changed.length > 0) {
      console.log(`AgentOffice repaired node-pty spawn-helper permissions for ${nodePtySetup.changed.join(", ")}`);
    }

    const host = options.host || DEFAULT_LAN_HOST;
    const port = Number(options.port || DEFAULT_PORT);
    const localServerUrl = `http://127.0.0.1:${port}`;
    const handlerPath = path.resolve(__dirname, "index.js");

    console.log("AgentOffice preflight");
    console.log(`- tmux: ${commandExists("tmux") ? resolveCommand("tmux") : "missing"}`);
    console.log(`- claude: ${commandExists("claude") ? resolveCommand("claude") : "missing"}`);
    console.log(`- codex: ${commandExists("codex") ? resolveCommand("codex") : "missing"}`);

    if (!hasClaudeHookConfig({ serverUrl: localServerUrl, handlerPath })) {
      const settingsPath = applyClaudeHookConfig({ serverUrl: localServerUrl, handlerPath });
      console.log(`- claude hooks: installed into ${settingsPath}`);
    } else {
      console.log("- claude hooks: configured");
    }

    if (!commandExists("tmux")) {
      throw new Error("tmux is required for AgentOffice local sessions. Install it first, for example with `brew install tmux`.");
    }

    const sleepInhibitor = startSleepInhibitor({ commandExists });
    if (sleepInhibitor.started) {
      console.log("- sleep guard: caffeinate active");
    } else if (process.platform === "darwin") {
      console.log("- sleep guard: skipped (caffeinate unavailable)");
    }

    const store = createSessionStore();
    const ptyManager = createPtyManager({ store });
    const restored = ptyManager.restoreManagedSessions();
    createAppServer({ host, port, store, ptyManager });
    console.log(`AgentOffice restored ${restored.length} session(s).`);
    console.log("AgentOffice URLs");
    for (const url of networkUrls({ host, port })) {
      console.log(`- ${url}`);
    }
    console.log("");

    // --- Hosted mode: connect tunnel to relay ---
    const hosted = resolveHostedOptions(options);
    if (hosted.key) {
      const localServerUrl = `http://127.0.0.1:${port}`;
      const tunnel = createTunnelClient({
        key: hosted.key,
        relayUrl: hosted.relayUrl,
        localServerUrl
      });
      console.log(`AgentOffice tunnel connecting to relay: ${hosted.relayUrl}`);
      console.log(`- hosted auth: key from ${hosted.keySource}, relay from ${hosted.relaySource}`);
      if (tunnel.logPath) {
        console.log(`- tunnel log: ${tunnel.logPath}`);
      }
      tunnel.sendStatusSummary(store.listSessionSummaries());

      let statusDebounceTimer = null;
      function scheduleStatusSummary() {
        if (statusDebounceTimer) return;
        statusDebounceTimer = setTimeout(() => {
          statusDebounceTimer = null;
          tunnel.sendStatusSummary(store.listSessionSummaries());
        }, 500);
      }

      store.emitter.on("session:update", scheduleStatusSummary);
      store.emitter.on("session:remove", scheduleStatusSummary);
    }

    return;
  }

  if (action === "attach") {
    if (!commandExists("tmux")) {
      throw new Error("tmux is required to attach to an AgentOffice worker.");
    }

    const target = subaction || command || options.session || options.id;
    const server = options.server || DEFAULT_SERVER_URL;
    const tmuxSession = await resolveAttachTarget({ target, server });
    if (!tmuxSession) {
      throw new Error(`unable to find a tmux worker for ${target || "<missing-session-id>"}`);
    }

    console.log(`Attaching local terminal to ${tmuxSession}`);
    const attached = spawnSync(tmuxPath(), ["attach-session", "-t", tmuxSession], {
      stdio: "inherit"
    });
    if (attached.status !== 0) {
      throw new Error((attached.stderr || attached.stdout || "tmux attach failed").toString().trim());
    }
    return;
  }

  if (action === "codex" || action === "claude") {
    const provider = action;
    const binary = options.bin || resolveCommand(provider) || provider;
    const server = options.server || DEFAULT_SERVER_URL;
    const transport = options.transport || "tmux";
    const sessionCommand = command || binary;
    const result = await postJson(`${server}/api/sessions/launch`, {
      provider,
      title: options.title || `${provider[0].toUpperCase()}${provider.slice(1)} Session`,
      cwd: options.cwd || process.cwd(),
      command: sessionCommand,
      transport
    });
    if (transport === "tmux") {
      console.log(`Attaching local terminal to ${result.session.meta.tmuxSession}`);
      const attached = spawnSync(tmuxPath(), ["attach-session", "-t", result.session.meta.tmuxSession], {
        stdio: "inherit"
      });
      if (attached.status !== 0) {
        throw new Error((attached.stderr || attached.stdout || "tmux attach failed").toString().trim());
      }
      return;
    }
    console.log(JSON.stringify(result.session, null, 2));
    return;
  }

  if (action === "cleanup") {
    if (!commandExists("tmux")) {
      console.log("No cleanup needed: tmux is not installed.");
      return;
    }
    const sessions = listAgentOfficeSessions();
    const records = listSessionRecords();
    if (sessions.length === 0) {
      for (const record of records) {
        removeSessionRecord(record.sessionId);
      }
      console.log(records.length > 0 ? `Removed ${records.length} stale AgentOffice record(s).` : "No AgentOffice tmux sessions found.");
      return;
    }
    for (const sessionName of sessions) {
      killSession(sessionName);
      console.log(`Removed ${sessionName}`);
    }
    for (const record of records) {
      removeSessionRecord(record.sessionId);
    }
    console.log(`Cleanup complete. Removed ${sessions.length} AgentOffice session(s).`);
    return;
  }

  if (action === "run") {
    if (!command) {
      throw new Error("missing command after --");
    }
    const server = options.server || DEFAULT_SERVER_URL;
    const transport = options.transport || defaultTransportForProvider(options.provider || "generic");
    const result = await postJson(`${server}/api/sessions/launch`, {
      provider: options.provider || "generic",
      title: options.title || command,
      cwd: options.cwd || process.cwd(),
      command,
      transport
    });
    if (options.attach) {
      if (result.session.transport !== "tmux" || !result.session.meta || !result.session.meta.tmuxSession) {
        throw new Error("--attach currently requires transport=tmux");
      }
      console.log(`Attaching local terminal to ${result.session.meta.tmuxSession}`);
      const attached = spawnSync(tmuxPath(), ["attach-session", "-t", result.session.meta.tmuxSession], {
        stdio: "inherit"
      });
      if (attached.status !== 0) {
        throw new Error((attached.stderr || attached.stdout || "tmux attach failed").toString().trim());
      }
      return;
    }
    console.log(JSON.stringify(result.session, null, 2));
    return;
  }

  if (action === "claude-hook") {
    const server = options.server || DEFAULT_SERVER_URL;
    try {
      const input = fs.readFileSync(0, "utf8");
      if (input.trim()) {
        await postJson(`${server}/api/providers/claude/hook`, JSON.parse(input));
      }
    } catch (error) {
      console.error(`AgentOffice claude-hook ignored error: ${error.message}`);
    }
    return;
  }

  if (action === "print-claude-hooks") {
    const server = options.server || DEFAULT_SERVER_URL;
    const settings = printClaudeHooksConfig({
      serverUrl: server,
      handlerPath: path.resolve(__dirname, "index.js")
    });
    console.log(JSON.stringify(settings, null, 2));
    return;
  }

  throw new Error(`unknown action: ${action}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
