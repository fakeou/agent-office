const crypto = require("node:crypto");
const os = require("node:os");
const pty = require("node-pty");
const { getProvider } = require("../providers");
const {
  AGENTTOWN_TMUX_PREFIX,
  attachClient,
  capturePane,
  createTmuxSession,
  describePane,
  killSession,
  localAttachCommand,
  sessionExists
} = require("./tmux");
const { listSessionRecords, persistSessionRecord, removeSessionRecord } = require("./session-registry");

function nextSessionId() {
  return `sess_${crypto.randomBytes(5).toString("hex")}`;
}

function defaultTransportForProvider(providerName) {
  if (providerName === "generic") {
    return "pty";
  }
  return "tmux";
}

function initialManagedState(providerName) {
  if (providerName === "codex") {
    return "idle";
  }
  return "working";
}

function createPtyManager({ store }) {
  const sessions = new Map();
  const eventsClients = new Set();
  const terminalClients = new Map();

  function broadcastEvent(payload) {
    const message = JSON.stringify(payload);
    for (const client of eventsClients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  function broadcastTerminal(sessionId, payload) {
    const clients = terminalClients.get(sessionId);
    if (!clients) {
      return;
    }
    const message = JSON.stringify(payload);
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  store.emitter.on("session:update", (session) => {
    if (!session) {
      return;
    }
    if (session.transport === "tmux" && session.status !== "exited" && session.meta && session.meta.tmuxSession) {
      persistSessionRecord(session);
    }
    if (session.status === "exited") {
      removeSessionRecord(session.sessionId);
    }
    broadcastEvent({ type: "session:update", session });
    broadcastTerminal(session.sessionId, { type: "session:update", session });
  });

  function applyProviderReconcile(session, result) {
    if (!result) {
      return;
    }

    if (result.session) {
      store.upsertSession({
        sessionId: session.sessionId,
        ...result.session
      });
    }

    const latest = store.getSession(session.sessionId);
    if (!latest) {
      return;
    }

    if (result.state && result.state !== latest.displayState) {
      store.setSessionState(session.sessionId, result.state, result.patch || {});
    } else if (result.patch) {
      store.upsertSession({ sessionId: session.sessionId, ...result.patch });
    }

    if (result.eventName) {
      store.addEvent(session.sessionId, result.eventName, { meta: result.meta || {} });
    }
  }

  function markRuntimeExit(sessionId, { exitCode = 0, signal = 0, reason = null } = {}) {
    const session = store.getSession(sessionId);
    if (!session) {
      return;
    }
    const provider = getProvider(session.provider);
    const next = provider.onExit({ session, exitCode, signal });
    store.markExit(sessionId, next);
    store.addEvent(sessionId, "session_exited", {
      meta: {
        exitCode,
        signal,
        reason,
        transport: session.transport
      }
    });
    broadcastTerminal(sessionId, { type: "terminal:exit", exitCode, signal });
    sessions.delete(sessionId);
  }

  function createPtyManagedSession({ sessionId, providerName, title, command, cwd }) {
    const provider = getProvider(providerName);
    const shell = process.env.SHELL || "/bin/zsh";
    const proc = pty.spawn(shell, ["-lc", command], {
      name: "xterm-color",
      cwd,
      env: process.env,
      cols: 120,
      rows: 32
    });

    const session = store.upsertSession({
      ...provider.createSession({ provider: providerName, title, command, cwd, mode: "managed", transport: "pty" }),
      sessionId,
      provider: providerName,
      title,
      command,
      cwd,
      pid: proc.pid,
      transport: "pty",
      state: initialManagedState(providerName),
      status: "running",
      host: os.hostname()
    });

    sessions.set(session.sessionId, {
      transport: "pty",
      providerName,
      provider,
      pty: proc,
      hasTerminal: true
    });

    store.addEvent(session.sessionId, "session_started", { meta: { managed: true, transport: "pty" } });

    proc.onData((chunk) => {
      store.appendOutput(session.sessionId, chunk);
      const nextState = provider.classifyOutput(chunk, store.getSession(session.sessionId));
      if (nextState) {
        store.setSessionState(session.sessionId, nextState, { status: "running" });
      }
      broadcastTerminal(session.sessionId, { type: "terminal:data", data: chunk });
    });

    proc.onExit(({ exitCode, signal }) => {
      markRuntimeExit(session.sessionId, { exitCode, signal, reason: "pty_exit" });
    });

    return store.getSession(session.sessionId);
  }

  function createTmuxManagedSession({ sessionId, providerName, title, command, cwd }) {
    const provider = getProvider(providerName);
    const shell = process.env.SHELL || "/bin/zsh";
    const tmuxSession = `${AGENTTOWN_TMUX_PREFIX}${sessionId}`;

    createTmuxSession({
      sessionName: tmuxSession,
      cwd,
      command,
      shell
    });

    const pane = describePane(tmuxSession);
    const session = store.upsertSession({
      ...provider.createSession({
        provider: providerName,
        title,
        command,
        cwd,
        mode: "managed",
        transport: "tmux",
        meta: {
          tmuxSession,
          localAttachCommand: localAttachCommand(tmuxSession)
        }
      }),
      sessionId,
      provider: providerName,
      title,
      command,
      cwd,
      pid: pane ? pane.pid : null,
      transport: "tmux",
      state: initialManagedState(providerName),
      status: "running",
      host: os.hostname(),
      meta: {
        tmuxSession,
        localAttachCommand: localAttachCommand(tmuxSession)
      }
    });

    sessions.set(session.sessionId, {
      transport: "tmux",
      providerName,
      provider,
      tmuxSession,
      cwd,
      hasTerminal: true
    });

    store.addEvent(session.sessionId, "session_started", {
      meta: {
        managed: true,
        transport: "tmux",
        tmuxSession
      }
    });

    return store.getSession(session.sessionId);
  }

  function restoreManagedSessions() {
    const restored = [];
    for (const record of listSessionRecords()) {
      if (!record || record.transport !== "tmux" || !record.meta || !record.meta.tmuxSession) {
        continue;
      }
      if (!sessionExists(record.meta.tmuxSession)) {
        removeSessionRecord(record.sessionId);
        continue;
      }

      const provider = getProvider(record.provider);
      const pane = describePane(record.meta.tmuxSession);
      const session = store.upsertSession({
        ...provider.createSession({
          provider: record.provider,
          title: record.title,
          command: record.command,
          cwd: record.cwd,
          mode: record.mode || "managed",
          transport: "tmux",
          meta: {
            ...(record.meta || {}),
            localAttachCommand: localAttachCommand(record.meta.tmuxSession)
          }
        }),
        sessionId: record.sessionId,
        provider: record.provider,
        title: record.title,
        command: record.command,
        cwd: record.cwd,
        mode: record.mode || "managed",
        transport: "tmux",
        state: record.state || "working",
        status: "running",
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        pid: pane ? pane.pid : null,
        host: record.host || os.hostname(),
        meta: {
          ...(record.meta || {}),
          localAttachCommand: localAttachCommand(record.meta.tmuxSession)
        }
      });

      sessions.set(session.sessionId, {
        transport: "tmux",
        providerName: session.provider,
        provider,
        tmuxSession: session.meta.tmuxSession,
        cwd: session.cwd,
        hasTerminal: true
      });

      store.addEvent(session.sessionId, "session_restored", {
        meta: {
          transport: "tmux",
          tmuxSession: session.meta.tmuxSession
        }
      });
      restored.push(store.getSession(session.sessionId));
    }
    return restored;
  }

  setInterval(() => {
    const currentSessions = store.listSessions();
    for (const session of currentSessions) {
      if (session.status === "exited") {
        continue;
      }

      const runtime = sessions.get(session.sessionId);
      if (session.transport === "tmux" && session.meta && session.meta.tmuxSession && !sessionExists(session.meta.tmuxSession)) {
        markRuntimeExit(session.sessionId, { exitCode: 0, signal: 0, reason: "tmux_session_missing" });
        continue;
      }

      if (runtime && runtime.transport === "tmux") {
        const pane = describePane(runtime.tmuxSession);
        if (pane) {
          if (pane.pid && pane.pid !== session.pid) {
            store.upsertSession({ sessionId: session.sessionId, pid: pane.pid });
          }
          if (pane.dead) {
            killSession(runtime.tmuxSession);
            markRuntimeExit(session.sessionId, {
              exitCode: pane.deadStatus == null ? 0 : pane.deadStatus,
              signal: 0,
              reason: "tmux_pane_dead"
            });
            continue;
          }
        }

        const screen = capturePane(runtime.tmuxSession);
        const nextState = runtime.provider.classifyOutput(screen, store.getSession(session.sessionId));
        if (nextState && nextState !== session.displayState) {
          store.setSessionState(session.sessionId, nextState, { status: "running" });
        }
      }

      const provider = getProvider(session.provider);
      applyProviderReconcile(session, provider.reconcileSession(session, { sessions: currentSessions }));
    }
  }, 1200);

  function createManagedSession({ provider: providerName, title, command, cwd, transport }) {
    const sessionId = nextSessionId();
    const resolvedTransport = transport || defaultTransportForProvider(providerName);
    if (resolvedTransport === "tmux") {
      return createTmuxManagedSession({ sessionId, providerName, title, command, cwd });
    }
    return createPtyManagedSession({ sessionId, providerName, title, command, cwd });
  }

  function resolveClaudeSessionId(mappedSession) {
    const existingHookSession = store.getSession(mappedSession.sessionId);
    if (existingHookSession) {
      return existingHookSession.sessionId;
    }

    const currentSessions = store.listSessions();
    const matchedManaged = currentSessions
      .filter((session) => session.provider === "claude")
      .filter((session) => session.transport === "tmux")
      .filter((session) => session.cwd === mappedSession.cwd)
      .filter((session) => session.status === "running")
      .find((session) => {
        const meta = session.meta || {};
        if (meta.hookSessionId === mappedSession.sessionId) {
          return true;
        }
        if (meta.hookSessionId) {
          return false;
        }
        return !meta.transcriptPath;
      });

    return matchedManaged ? matchedManaged.sessionId : mappedSession.sessionId;
  }

  function isClaudePermissionDeny(meta = {}) {
    const text = [meta.reason, meta.message, meta.error]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes("permission") && (text.includes("deny") || text.includes("denied") || text.includes("reject") || text.includes("declin"));
  }

  function ingestClaudeHook(payload) {
    const provider = getProvider("claude");
    const mapped = provider.mapHookPayload(payload);
    const hookTimestamp = new Date().toISOString();
    const targetSessionId = resolveClaudeSessionId(mapped.session);
    const isManagedTarget = targetSessionId !== mapped.session.sessionId;
    const previousSession = store.getSession(targetSessionId);
    const session = store.upsertSession({
      ...mapped.session,
      sessionId: targetSessionId,
      mode: isManagedTarget ? "managed" : mapped.session.mode,
      transport: isManagedTarget ? "tmux" : mapped.session.transport,
      title: isManagedTarget ? undefined : mapped.session.title,
      command: isManagedTarget ? undefined : mapped.session.command,
      meta: {
        ...(mapped.session.meta || {}),
        hookSessionId: mapped.session.sessionId,
        lastHookAt: hookTimestamp,
        approvalRequestedAt: mapped.state === "approval" ? hookTimestamp : undefined
      }
    });
    let effectiveState = mapped.state;
    if (!effectiveState && previousSession && previousSession.displayState === "approval") {
      if (mapped.eventName === "posttooluse") {
        effectiveState = "working";
      } else if (mapped.eventName === "tool_failure" && isClaudePermissionDeny(mapped.meta)) {
        effectiveState = "idle";
      }
    }
    if (effectiveState) {
      store.setSessionState(session.sessionId, effectiveState, { status: mapped.session.status || session.status });
    }
    if (mapped.eventName) {
      store.addEvent(session.sessionId, mapped.eventName, { meta: mapped.meta });
    }
    if (mapped.session.status === "exited") {
      const runtime = sessions.get(session.sessionId);
      if (runtime && runtime.transport === "tmux") {
        return store.getSession(session.sessionId);
      }
      store.markExit(session.sessionId, { status: "exited", state: "idle", displayState: "idle", displayZone: "idle-zone" });
    }
    return store.getSession(session.sessionId);
  }

  function registerEventsSocket(ws) {
    eventsClients.add(ws);
    ws.send(JSON.stringify({ type: "sessions:snapshot", sessions: store.listSessions() }));
    ws.on("close", () => {
      eventsClients.delete(ws);
    });
  }

  function registerTerminalSocket(sessionId, ws) {
    const set = terminalClients.get(sessionId) || new Set();
    set.add(ws);
    terminalClients.set(sessionId, set);
    ws.send(JSON.stringify({ type: "session:update", session: store.getSession(sessionId) }));

    const entry = sessions.get(sessionId);
    if (!entry) {
      const session = store.getSession(sessionId);
      const reason = session && session.transport === "hook"
        ? "This Claude worker came from hooks only. It updates state in the workshop but does not own a shared terminal. Launch Claude with `agenttown claude` if you want terminal control."
        : "No managed terminal transport is attached to this session.";
      ws.send(JSON.stringify({ type: "terminal:unavailable", reason }));
    }

    let attachedClient = null;
    if (entry && entry.transport === "tmux") {
      try {
        const snapshot = capturePane(entry.tmuxSession);
        if (snapshot && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "terminal:data", data: `${snapshot}\r\n` }));
        }
        attachedClient = attachClient(entry.tmuxSession, { cwd: entry.cwd });
        attachedClient.onData((chunk) => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "terminal:data", data: chunk }));
          }
        });
        attachedClient.onExit(({ exitCode, signal }) => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "terminal:exit", exitCode, signal }));
          }
        });
      } catch (error) {
        ws.send(JSON.stringify({ type: "terminal:error", message: error.message }));
      }
    }

    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw));
        const runtime = sessions.get(sessionId);
        if (!runtime) {
          return;
        }
        if (message.type === "input") {
          if (runtime.transport === "pty") {
            runtime.pty.write(message.data || "");
          } else if (attachedClient) {
            attachedClient.write(message.data || "");
          }
          return;
        }
        if (message.type === "resize") {
          if (runtime.transport === "pty") {
            runtime.pty.resize(Number(message.cols || 120), Number(message.rows || 32));
          } else if (attachedClient) {
            attachedClient.resize(Number(message.cols || 120), Number(message.rows || 32));
          }
        }
      } catch (error) {
        ws.send(JSON.stringify({ type: "terminal:error", message: error.message }));
      }
    });

    ws.on("close", () => {
      if (attachedClient) {
        try {
          attachedClient.kill();
        } catch {
          // Ignore already-closed terminal clients.
        }
      }
      const clients = terminalClients.get(sessionId);
      if (!clients) {
        return;
      }
      clients.delete(ws);
      if (clients.size === 0) {
        terminalClients.delete(sessionId);
      }
    });
  }

  return {
    createManagedSession,
    defaultTransportForProvider,
    ingestClaudeHook,
    restoreManagedSessions,
    registerEventsSocket,
    registerTerminalSocket
  };
}

module.exports = {
  createPtyManager,
  defaultTransportForProvider
};
