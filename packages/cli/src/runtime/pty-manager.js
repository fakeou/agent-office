const crypto = require("node:crypto");
const os = require("node:os");
const pty = require("node-pty");
const { displayZoneFor, getProvider } = require("../core");
const {
  AGENTOFFICE_TMUX_PREFIX,
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

function initialManagedState() {
  return "idle";
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
    const terminalBacked = session.transport === "tmux" && session.meta && session.meta.tmuxSession;
    const terminalClosed = ["completed", "exited"].includes(session.status);
    if (terminalBacked && !terminalClosed) {
      persistSessionRecord(session);
    }
    if (terminalBacked && terminalClosed) {
      removeSessionRecord(session.sessionId);
    }
    broadcastEvent({
      type: "session:update",
      session: store.getSessionSummary(session.sessionId)
    });
    broadcastTerminal(session.sessionId, { type: "session:update", session });
  });

  store.emitter.on("session:remove", (payload) => {
    if (!payload || !payload.sessionId) {
      return;
    }
    removeSessionRecord(payload.sessionId);
    broadcastEvent({ type: "session:remove", sessionId: payload.sessionId });
    broadcastTerminal(payload.sessionId, { type: "session:remove", sessionId: payload.sessionId });
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

  function markRuntimeExit(sessionId, { exitCode = 0, signal = 0, reason = null, patchOverride = null } = {}) {
    const session = store.getSession(sessionId);
    if (!session) {
      return;
    }
    if (["completed", "exited"].includes(session.status)) {
      sessions.delete(sessionId);
      store.removeSession(sessionId);
      return;
    }
    const provider = getProvider(session.provider);
    const next = patchOverride || provider.onExit({ session, exitCode, signal });
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
    const latest = store.getSession(sessionId);
    if (latest && ["completed", "exited"].includes(latest.status)) {
      store.removeSession(sessionId);
    }
  }

  function createPtyManagedSession({ sessionId, providerName, title, command, cwd }) {
    const provider = getProvider(providerName);
    const shell = process.env.SHELL || "/bin/zsh";
    const proc = pty.spawn(shell, ["-lc", command], {
      name: "xterm-256color",
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
    const tmuxSession = `${AGENTOFFICE_TMUX_PREFIX}${sessionId}`;

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

  setInterval(async () => {
    const currentSessions = store.listSessions();
    for (const session of currentSessions) {
      if (["completed", "exited"].includes(session.status)) {
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

        const provider = getProvider(session.provider);
        const screen = await capturePane(runtime.tmuxSession);
        const latestSession = store.getSession(session.sessionId) || session;
        const overlayState = runtime.provider.classifyOutput(screen, latestSession);

        if (overlayState && overlayState !== latestSession.displayState) {
          store.setSessionState(session.sessionId, latestSession.state || "working", {
            status: "running",
            displayState: overlayState,
            displayZone: displayZoneFor(overlayState)
          });
        }

        const reconciledSession = store.getSession(session.sessionId) || session;
        const reconcileResult = provider.reconcileSession(reconciledSession, { sessions: currentSessions });
        applyProviderReconcile(reconciledSession, reconcileResult);
        continue;
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

    // Only update sessions started via `ato claude` (managed tmux sessions).
    // Ignore hooks from external Claude processes not launched by AgentOffice.
    if (!isManagedTarget) {
      return null;
    }

    const previousSession = store.getSession(targetSessionId);
    const session = store.upsertSession({
      ...mapped.session,
      sessionId: targetSessionId,
      mode: "managed",
      transport: "tmux",
      title: undefined,
      command: undefined,
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
        killSession(runtime.tmuxSession);
        markRuntimeExit(session.sessionId, {
          exitCode: 0,
          signal: 0,
          reason: "hook_session_end",
          patchOverride: { state: "idle", status: "exited" }
        });
        return store.getSession(session.sessionId);
      }
      store.markExit(session.sessionId, { status: "exited", state: "idle", displayState: "idle", displayZone: "idle-zone" });
    }
    return store.getSession(session.sessionId);
  }

  function registerEventsSocket(ws) {
    eventsClients.add(ws);
    ws.send(JSON.stringify({
      type: "sessions:snapshot",
      sessions: store.listSessionSummaries()
    }));
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
        ? "This Claude worker came from hooks only. It updates state in the office but does not own a shared terminal. Launch Claude with `ato claude` if you want terminal control."
        : "No managed terminal transport is attached to this session.";
      ws.send(JSON.stringify({ type: "terminal:unavailable", reason }));
    }

    let attachedClient = null;
    let tmuxStreamStarted = false;
    let pendingCols = 120;
    let pendingRows = 32;

    async function startTmuxStream(cols, rows) {
      if (tmuxStreamStarted || !entry || entry.transport !== "tmux") {
        return;
      }
      tmuxStreamStarted = true;
      pendingCols = cols;
      pendingRows = rows;
      try {
        const snapshot = await capturePane(entry.tmuxSession);
        if (snapshot && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "terminal:data", data: `${snapshot}\r\n` }));
        }
        attachedClient = attachClient(entry.tmuxSession, { cwd: entry.cwd, cols, rows });
        if (pendingCols !== cols || pendingRows !== rows) {
          attachedClient.resize(pendingCols, pendingRows);
        }
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

    // For non-tmux transports that had immediate setup, keep original behavior
    if (entry && entry.transport === "pty") {
      const replay = store.getTerminalReplay(sessionId);
      if (replay) {
        ws.send(JSON.stringify({ type: "terminal:data", data: replay }));
      }
    } else if (entry && entry.transport === "tmux") {
      void startTmuxStream(120, 32);
    }

    ws.on("message", async (raw) => {
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
          const cols = Number(message.cols || 120);
          const rows = Number(message.rows || 32);
          pendingCols = cols;
          pendingRows = rows;
          if (runtime.transport === "pty") {
            runtime.pty.resize(cols, rows);
          } else if (!tmuxStreamStarted) {
            // First resize from client — start tmux stream at the correct size
            await startTmuxStream(cols, rows);
          } else if (attachedClient) {
            attachedClient.resize(cols, rows);
          }
        }
      } catch (error) {
        ws.send(JSON.stringify({ type: "terminal:error", message: error.message }));
      }
    });

    ws.on("close", () => {
      if (attachedClient) {
        // Kill the linked web-view tmux session first, then the PTY process
        if (attachedClient.webTmuxSession) {
          try {
            killSession(attachedClient.webTmuxSession);
          } catch {
            // Linked session may already be gone
          }
        }
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
