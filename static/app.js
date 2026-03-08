(function () {
  const zones = [
    { id: "working-zone", title: "Workshop Floor", description: "Thinking, searching, editing, or running tools", color: "var(--working)" },
    { id: "approval-zone", title: "Approval Desk", description: "Waiting for permission, confirmation, or explicit approval", color: "var(--waiting)" },
    { id: "attention-zone", title: "Attention Desk", description: "Needs intervention or review", color: "var(--attention)" },
    { id: "idle-zone", title: "Idle", description: "No active task right now", color: "var(--idle)" }
  ];

  const state = {
    sessions: [],
    serverOnline: false,
    terminal: null,
    fitAddon: null,
    terminalSocket: null,
    terminalSessionId: null,
    sessionMap: new Map()
  };

  const app = document.querySelector("#app");
  const eventsSocket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws/events`);

  eventsSocket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "sessions:snapshot") {
      state.sessions = payload.sessions.filter(isVisibleWorkshopSession);
    }
    if (payload.type === "session:update") {
      state.sessions = upsertSession(state.sessions, payload.session).filter(isVisibleWorkshopSession);
    }
    state.sessionMap = new Map(state.sessions.map((session) => [session.sessionId, session]));
    state.serverOnline = true;
    if (route().name === "terminal") {
      renderTerminalInfo(route().sessionId);
    } else {
      render();
    }
  });

  eventsSocket.addEventListener("close", () => {
    state.serverOnline = false;
    render();
  });

  window.addEventListener("hashchange", render);
  window.addEventListener("resize", () => {
    if (!state.fitAddon || !state.terminalSocket || state.terminalSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    state.fitAddon.fit();
    state.terminalSocket.send(JSON.stringify({
      type: "resize",
      cols: state.terminal.cols,
      rows: state.terminal.rows
    }));
  });

  function isVisibleWorkshopSession(session) {
    return !["completed", "exited"].includes(session.status);
  }

  function upsertSession(items, next) {
    const found = items.findIndex((item) => item.sessionId === next.sessionId);
    if (found === -1) {
      return [next, ...items];
    }
    const cloned = items.slice();
    cloned[found] = next;
    return cloned;
  }

  function route() {
    const match = location.hash.match(/^#\/terminal\/([^/]+)$/);
    if (match) {
      return { name: "terminal", sessionId: decodeURIComponent(match[1]) };
    }
    return { name: "workshop" };
  }

  async function api(path, options) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  }

  async function handleQuickLaunch(provider) {
    const names = {
      claude: "Claude Session",
      codex: "Codex Session"
    };

    await api("/api/sessions/launch", {
      method: "POST",
      body: JSON.stringify({
        provider,
        transport: "tmux",
        title: names[provider] || `${provider} session`,
        command: provider
      })
    });
  }

  function connectTerminal(sessionId) {
    if (state.terminalSessionId === sessionId && state.terminalSocket) {
      return;
    }
    cleanupTerminal();
    if (state.terminalSocket) {
      state.terminalSocket.close();
      state.terminalSocket = null;
    }
    state.terminalSessionId = sessionId;

    const host = document.querySelector("#terminal-host");
    if (!host) {
      return;
    }

    state.terminal = new window.Terminal({
      cursorBlink: true,
      fontSize: 13,
      theme: {
        background: "#151311",
        foreground: "#f7f0df"
      }
    });
    state.fitAddon = new window.FitAddon.FitAddon();
    state.terminal.loadAddon(state.fitAddon);
    state.terminal.open(host);
    state.fitAddon.fit();

    const ws = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws/terminal/${encodeURIComponent(sessionId)}`);
    state.terminalSocket = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "resize", cols: state.terminal.cols, rows: state.terminal.rows }));
    });

    ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "terminal:data") {
        state.terminal.write(payload.data);
        return;
      }
      if (payload.type === "terminal:unavailable") {
        const warning = document.querySelector("#terminal-warning");
        if (warning) {
          warning.textContent = payload.reason;
        }
        if (state.terminal) {
          state.terminal.write(`\r\n[terminal unavailable]\r\n${payload.reason}\r\n`);
        }
        return;
      }
      if (payload.type === "terminal:exit") {
        state.terminal.write(`\r\n\r\n[process exited: ${payload.exitCode}]\r\n`);
        return;
      }
      if (payload.type === "session:update") {
        state.sessions = upsertSession(state.sessions, payload.session).filter(isVisibleWorkshopSession);
        state.sessionMap = new Map(state.sessions.map((session) => [session.sessionId, session]));
        renderTerminalInfo(sessionId);
      }
    });

    state.terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });
  }

  function cleanupTerminal() {
    if (state.terminalSocket) {
      state.terminalSocket.close();
      state.terminalSocket = null;
    }
    if (state.terminal) {
      state.terminal.dispose();
      state.terminal = null;
    }
    state.fitAddon = null;
    state.terminalSessionId = null;
  }

  function renderWorkshop() {
    cleanupTerminal();
    const sessionCount = state.sessions.length;
    app.innerHTML = `
      <div class="page-shell">
        <header class="topbar">
          <div>
            <p class="eyebrow">AgentTown</p>
            <h1>Provider-based AI Workshop</h1>
          </div>
          <div class="worker-meta-row">
            <span class="pill">${sessionCount} active workers</span>
            <span class="status-pill">${state.serverOnline ? "online" : "offline"}</span>
          </div>
        </header>

        <main class="layout">
          <section class="panel">
            <div class="section-head">
              <div>
                <h2>Workshop Floor</h2>
                <p>Four user-facing states on top of provider adapters. Claude prefers hooks; Codex and others can fall back to provider-specific runtime parsing.</p>
              </div>
            </div>
            <div class="workshop-grid">
              ${zones.map(renderZone).join("")}
            </div>
          </section>

          <aside class="panel">
            <div class="section-head">
              <div>
                <h2>Quick Launch</h2>
                <p>Start a local tmux-backed worker in one click. Advanced launch options still live in the CLI.</p>
              </div>
            </div>
            <div class="stacked-form quick-launch-actions">
              <button class="primary-button" type="button" data-launch-provider="claude">Launch Claude</button>
              <button class="primary-button" type="button" data-launch-provider="codex">Launch Codex</button>
              <p class="helper-text">Web launch defaults to <code>tmux</code> transport and uses the daemon working directory. Use the CLI when you need a custom title, working directory, or command.</p>
            </div>

            <div class="legend">
              ${zones.map((zone) => `
                <div class="legend-item">
                  <span class="legend-color" style="background:${zone.color}"></span>
                  <div>
                    <strong>${zone.title}</strong>
                    <p class="helper-text">${zone.description}</p>
                  </div>
                </div>
              `).join("")}
            </div>
          </aside>
        </main>
      </div>
    `;

    document.querySelectorAll("[data-launch-provider]").forEach((element) => {
      element.addEventListener("click", async () => {
        element.disabled = true;
        try {
          await handleQuickLaunch(element.dataset.launchProvider);
        } finally {
          element.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-session-id]").forEach((element) => {
      element.addEventListener("click", () => {
        location.hash = `#/terminal/${element.dataset.sessionId}`;
      });
    });
  }

  function renderZone(zone) {
    const workers = state.sessions.filter((session) => session.displayZone === zone.id);
    return `
      <section class="zone" style="--zone-color:${zone.color}">
        <div class="zone-head">
          <div>
            <h3>${zone.title}</h3>
            <p>${zone.description}</p>
          </div>
          <span class="zone-count">${workers.length}</span>
        </div>
        <div class="worker-list">
          ${workers.length ? workers.map(renderWorkerCard).join("") : `<div class="empty-state">No workers here.</div>`}
        </div>
      </section>
    `;
  }

  function renderWorkerCard(session) {
    return `
      <button class="worker-card" type="button" data-session-id="${session.sessionId}">
        <div class="worker-sprite" style="--shirt-color:${colorByProvider(session.provider)}"></div>
        <h3>${escapeHtml(session.title)}</h3>
        <p>${escapeHtml(session.provider)} · ${escapeHtml(session.displayState)}</p>
        <p>${escapeHtml(session.mode)} · ${escapeHtml(session.transport || "pty")}</p>
      </button>
    `;
  }

  function renderTerminal() {
    const { sessionId } = route();
    const session = state.sessionMap.get(sessionId);

    app.innerHTML = `
      <div class="terminal-shell">
        <header class="terminal-topbar">
          <div class="terminal-meta">
            <button class="ghost-button" id="back-button" type="button">Back to workshop</button>
            <div class="terminal-info">
              <p class="eyebrow">Terminal View</p>
              <h2 id="terminal-title">${escapeHtml(session ? session.title : sessionId)}</h2>
              <p id="terminal-summary">${session ? `${session.provider} · ${session.displayState}` : "Loading session..."}</p>
            </div>
          </div>
          <div class="terminal-meta">
            <span class="pill" id="terminal-state">${session ? session.displayState : "idle"}</span>
          </div>
        </header>

        <div class="terminal-layout">
          <section class="terminal-panel">
            <div id="terminal-host" class="terminal-host"></div>
          </section>
          <aside class="terminal-sidebar">
            <div>
              <p class="eyebrow">Session</p>
              <div id="terminal-metadata" class="terminal-info">
                ${renderTerminalMetadata(session)}
              </div>
            </div>
            <div>
              <p class="eyebrow">Connection</p>
              <p id="terminal-warning" class="terminal-warning"></p>
            </div>
            <div>
              <p class="eyebrow">Recent Logs</p>
              <div id="terminal-logs" class="log-box">${session && session.logs ? escapeHtml(session.logs.slice(-60).join("\n")) : "No logs captured yet."}</div>
            </div>
          </aside>
        </div>
      </div>
    `;

    document.querySelector("#back-button").addEventListener("click", () => {
      location.hash = "#/";
    });

    connectTerminal(sessionId);
  }

  function renderTerminalInfo(sessionId) {
    const session = state.sessionMap.get(sessionId);
    if (!session || route().name !== "terminal" || route().sessionId !== sessionId) {
      return;
    }
    const title = document.querySelector("#terminal-title");
    const summary = document.querySelector("#terminal-summary");
    const statePill = document.querySelector("#terminal-state");
    const metadata = document.querySelector("#terminal-metadata");
    const logs = document.querySelector("#terminal-logs");
    if (title) title.textContent = session.title;
    if (summary) summary.textContent = `${session.provider} · ${session.displayState}`;
    if (statePill) statePill.textContent = session.displayState;
    if (metadata) metadata.innerHTML = renderTerminalMetadata(session);
    if (logs) logs.textContent = (session.logs || []).slice(-60).join("\n") || "No logs captured yet.";
  }

  function renderTerminalMetadata(session) {
    if (!session) {
      return `<p class="helper-text">Session details will appear here once loaded.</p>`;
    }
    return `
      <p><strong>Provider:</strong> ${escapeHtml(session.provider)}</p>
      <p><strong>Mode:</strong> ${escapeHtml(session.mode)}</p>
      <p><strong>Transport:</strong> ${escapeHtml(session.transport || "pty")}</p>
      <p><strong>Status:</strong> ${escapeHtml(session.status)}</p>
      <p><strong>CWD:</strong> <code>${escapeHtml(session.cwd)}</code></p>
      <p><strong>Command:</strong> <code>${escapeHtml(session.command || "hooked session")}</code></p>
      <p><strong>PID:</strong> ${session.pid || "-"}</p>
      ${session.meta && session.meta.tmuxSession ? `<p><strong>tmux:</strong> <code>${escapeHtml(session.meta.tmuxSession)}</code></p>` : ""}
      ${session.meta && session.meta.localAttachCommand ? `<p><strong>Local Attach:</strong> <code>${escapeHtml(session.meta.localAttachCommand)}</code></p>` : ""}
    `;
  }

  function render() {
    if (route().name === "terminal") {
      renderTerminal();
      return;
    }
    renderWorkshop();
  }

  function colorByProvider(provider) {
    if (provider === "claude") return "#7ea9d1";
    if (provider === "codex") return "#d98f72";
    return "#90b98b";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  render();
})();
