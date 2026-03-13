(function () {
  // Detect if served through a relay tunnel: /tunnel/:userId/app.js
  const tunnelMatch = location.pathname.match(/^\/tunnel\/([^/]+)/);
  const TUNNEL_PREFIX = tunnelMatch ? `/tunnel/${tunnelMatch[1]}` : "";

  // Configurable API base — supports standalone deployment (CDN/Vercel) pointing to a relay
  const API_BASE = window.AGENTTOWN_API_BASE || TUNNEL_PREFIX;
  const WS_BASE = window.AGENTTOWN_WS_BASE || `${location.origin.replace(/^http/, "ws")}${TUNNEL_PREFIX}`;

  const zones = [
    { id: "working-zone", title: "Workshop Floor", description: "Thinking, searching, editing, or running tools", color: "var(--working)" },
    { id: "approval-zone", title: "Approval Desk", description: "Waiting for permission, confirmation, or explicit approval", color: "var(--waiting)" },
    { id: "attention-zone", title: "Attention Desk", description: "Needs intervention or review", color: "var(--attention)" },
    { id: "idle-zone", title: "Idle", description: "No active task right now", color: "var(--idle)" }
  ];

  const state = {
    sessions: [],
    serverOnline: false,
    navOpen: false,
    terminal: null,
    fitAddon: null,
    terminalSocket: null,
    terminalSessionId: null,
    sessionMap: new Map(),
    connectionStatus: "connecting"
  };

  const app = document.querySelector("#app");

  // --- WebSocket reconnection for /ws/events ---

  let eventsSocket = null;
  let eventsReconnectDelay = 1000;
  const EVENTS_MAX_DELAY = 30000;

  function connectEventsSocket() {
    state.connectionStatus = "connecting";
    let wsUrl = `${WS_BASE}/ws/events`;
    if (TUNNEL_PREFIX) {
      const jwt = getJwt();
      if (jwt) wsUrl += `?token=${encodeURIComponent(jwt)}`;
    }
    eventsSocket = new WebSocket(wsUrl);

    eventsSocket.addEventListener("open", () => {
      state.connectionStatus = "connected";
      state.serverOnline = true;
      eventsReconnectDelay = 1000;
      updateConnectionIndicator();
    });

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

    eventsSocket.addEventListener("close", (event) => {
      state.serverOnline = false;
      state.connectionStatus = "reconnecting";
      updateConnectionIndicator();

      if (event.code === 4401 || event.reason === "unauthorized") {
        handleUnauthorized();
        return;
      }

      setTimeout(() => {
        eventsReconnectDelay = Math.min(eventsReconnectDelay * 2, EVENTS_MAX_DELAY);
        connectEventsSocket();
      }, eventsReconnectDelay);
    });

    eventsSocket.addEventListener("error", () => {
      // Will trigger close event
    });
  }

  function reconnectEventsAndSync() {
    if (eventsSocket) {
      eventsSocket.close();
    }
    connectEventsSocket();
    api(`/api/sessions`).then((data) => {
      if (data && data.sessions) {
        state.sessions = data.sessions.filter(isVisibleWorkshopSession);
        state.sessionMap = new Map(state.sessions.map((s) => [s.sessionId, s]));
        render();
      }
    }).catch(() => {});
  }

  connectEventsSocket();

  // --- Connection status indicator ---

  function updateConnectionIndicator() {
    const pill = document.querySelector(".status-pill");
    if (pill) {
      const dot = pill.querySelector(".status-dot");
      if (state.connectionStatus === "connected") {
        pill.setAttribute("data-status", "connected");
        if (dot) dot.style.background = "#78b07a";
        const label = pill.querySelector(".status-label");
        if (label) label.textContent = "online";
      } else if (state.connectionStatus === "reconnecting") {
        pill.setAttribute("data-status", "reconnecting");
        if (dot) dot.style.background = "";
        const label = pill.querySelector(".status-label");
        if (label) label.textContent = "reconnecting\u2026";
      } else {
        pill.setAttribute("data-status", "connecting");
        if (dot) dot.style.background = "";
        const label = pill.querySelector(".status-label");
        if (label) label.textContent = "connecting\u2026";
      }
    }
  }

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

  function getJwt() {
    return localStorage.getItem("agenttown_jwt");
  }

  function handleUnauthorized() {
    if (TUNNEL_PREFIX) {
      localStorage.removeItem("agenttown_jwt");
      localStorage.removeItem("agenttown_user_id");
      window.location.href = "/";
    } else {
      window.location.href = "/login.html";
    }
  }

  function getUserId() {
    const storedUserId = localStorage.getItem("agenttown_user_id");
    if (storedUserId) {
      return storedUserId;
    }
    return tunnelMatch ? decodeURIComponent(tunnelMatch[1]) : "";
  }

  function renderNavDrawer(activeView) {
    if (!TUNNEL_PREFIX) {
      return "";
    }

    return `
      <div class="nav-drawer ${state.navOpen ? "is-open" : ""}" aria-hidden="${state.navOpen ? "false" : "true"}">
        <button class="nav-drawer-backdrop" type="button" aria-label="Close menu" data-nav-close></button>
        <aside class="nav-drawer-panel">
          <div class="nav-drawer-head">
            <div>
              <p class="eyebrow">Navigate</p>
              <strong>AgentTown</strong>
            </div>
            <button class="nav-close-button" type="button" aria-label="Close menu" data-nav-close>&times;</button>
          </div>
          <nav class="nav-drawer-links">
            <a class="nav-link ${activeView === "workshop" ? "is-active" : ""}" href="${TUNNEL_PREFIX}/workshop.html">
              <span class="nav-link-title">Workshop</span>
              <span class="nav-link-copy">Live workers and shared terminals</span>
            </a>
            <a class="nav-link ${activeView === "api-keys" ? "is-active" : ""}" href="/dashboard.html">
              <span class="nav-link-title">API Key</span>
              <span class="nav-link-copy">Create and revoke hosted access keys</span>
            </a>
          </nav>
        </aside>
      </div>
    `;
  }

  function bindNavDrawer() {
    function syncNavDrawer() {
      const drawer = document.querySelector(".nav-drawer");
      if (!drawer) {
        return;
      }
      drawer.classList.toggle("is-open", state.navOpen);
      drawer.setAttribute("aria-hidden", state.navOpen ? "false" : "true");
    }

    document.querySelectorAll("[data-nav-toggle]").forEach((element) => {
      element.addEventListener("click", () => {
        state.navOpen = true;
        syncNavDrawer();
      });
    });

    document.querySelectorAll("[data-nav-close]").forEach((element) => {
      element.addEventListener("click", () => {
        state.navOpen = false;
        syncNavDrawer();
      });
    });
  }

  async function api(urlPath, options) {
    const headers = { "Content-Type": "application/json" };
    // In tunnel mode, attach JWT as Bearer token
    if (TUNNEL_PREFIX) {
      const jwt = getJwt();
      if (jwt) {
        headers["Authorization"] = `Bearer ${jwt}`;
      }
    }
    const response = await fetch(`${API_BASE}${urlPath}`, {
      headers,
      ...options
    });
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error("unauthorized");
    }
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

  // --- Terminal WebSocket with reconnection ---

  let terminalReconnectDelay = 1000;
  const TERMINAL_MAX_DELAY = 30000;
  let terminalReconnectTimer = null;

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
    terminalReconnectDelay = 1000;

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

    openTerminalSocket(sessionId);
  }

  function openTerminalSocket(sessionId) {
    let wsUrl = `${WS_BASE}/ws/terminal/${encodeURIComponent(sessionId)}`;
    if (TUNNEL_PREFIX) {
      const jwt = getJwt();
      if (jwt) wsUrl += `?token=${encodeURIComponent(jwt)}`;
    }
    const ws = new WebSocket(wsUrl);
    state.terminalSocket = ws;

    ws.addEventListener("open", () => {
      terminalReconnectDelay = 1000;
      updateTerminalWarning("");
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

    ws.addEventListener("close", (event) => {
      if (state.terminalSessionId !== sessionId) {
        return;
      }

      if (event.code === 4401 || event.reason === "unauthorized") {
        handleUnauthorized();
        return;
      }

      if (route().name === "terminal" && route().sessionId === sessionId) {
        updateTerminalWarning("Connection lost. Reconnecting...");
        if (state.terminal) {
          state.terminal.write("\r\n[connection lost, reconnecting...]\r\n");
        }
        terminalReconnectTimer = setTimeout(() => {
          if (state.terminalSessionId === sessionId && route().name === "terminal") {
            terminalReconnectDelay = Math.min(terminalReconnectDelay * 2, TERMINAL_MAX_DELAY);
            openTerminalSocket(sessionId);
          }
        }, terminalReconnectDelay);
      }
    });

    ws.addEventListener("error", () => {
      // Will trigger close
    });

    state.terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });
  }

  function updateTerminalWarning(msg) {
    const el = document.querySelector("#terminal-warning");
    if (el) {
      el.textContent = msg;
    }
  }

  function cleanupTerminal() {
    if (terminalReconnectTimer) {
      clearTimeout(terminalReconnectTimer);
      terminalReconnectTimer = null;
    }
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
    const statusLabel = state.connectionStatus === "connected" ? "online" :
      state.connectionStatus === "reconnecting" ? "reconnecting\u2026" : "connecting\u2026";
    const statusAttr = state.connectionStatus === "connected" ? "connected" : state.connectionStatus;

    app.innerHTML = `
      <div class="page-shell">
        ${renderNavDrawer("workshop")}
        <header class="topbar">
          <div class="topbar-main">
            ${TUNNEL_PREFIX ? `<button class="menu-button" type="button" data-nav-toggle>
              <span class="menu-button-lines"></span>
              <span class="menu-button-label">More</span>
            </button>` : ""}
            <div class="topbar-brand">
              <div class="brand-mark">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
              </div>
              <div class="topbar-text">
                <p class="eyebrow">AgentTown</p>
                <h1>Workshop</h1>
              </div>
            </div>
          </div>
          <div class="topbar-pills">
            <span class="pill">${sessionCount} active</span>
            <span class="status-pill" data-status="${statusAttr}"><span class="status-dot"></span><span class="status-label">${statusLabel}</span></span>
          </div>
        </header>

        <main class="layout">
          <section class="panel">
            <div class="section-head">
              <div>
                <h2>Workshop Floor</h2>
                <p class="helper-text">Four states on top of provider adapters. Workers move between zones based on their activity.</p>
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
                <p class="helper-text">Start a tmux-backed worker in one click.</p>
              </div>
            </div>
            <div class="quick-launch-actions">
              <button class="primary-button" type="button" data-launch-provider="claude">Launch Claude</button>
              <button class="primary-button" type="button" data-launch-provider="codex">Launch Codex</button>
              <p class="helper-text">Web launch defaults to <code>tmux</code> transport. Use the CLI for custom title, working directory, or command.</p>
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
    bindNavDrawer();
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
    const providerClass = ["claude", "codex"].includes(session.provider) ? `provider-${session.provider}` : "provider-generic";
    return `
      <button class="worker-card" type="button" data-session-id="${session.sessionId}">
        <div class="worker-icon ${providerClass}">
          ${providerIcon(session.provider)}
        </div>
        <div class="worker-card-text">
          <h3>${escapeHtml(session.title)}</h3>
          <p>${escapeHtml(session.provider)} · ${escapeHtml(session.displayState)}</p>
        </div>
      </button>
    `;
  }

  function renderTerminal() {
    const { sessionId } = route();
    const session = state.sessionMap.get(sessionId);

    app.innerHTML = `
      <div class="terminal-shell">
        ${renderNavDrawer("workshop")}
        <header class="terminal-topbar">
          <div class="terminal-meta">
            ${TUNNEL_PREFIX ? `<button class="menu-button" type="button" data-nav-toggle>
              <span class="menu-button-lines"></span>
              <span class="menu-button-label">More</span>
            </button>` : ""}
            <button class="ghost-button" id="back-button" type="button">\u2190 Workshop</button>
            <div class="terminal-info">
              <p class="eyebrow">Terminal</p>
              <h2 id="terminal-title">${escapeHtml(session ? session.title : sessionId)}</h2>
              <p id="terminal-summary">${session ? `${session.provider} \u00b7 ${session.displayState}` : "Loading\u2026"}</p>
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
          <aside class="terminal-sidebar" id="terminal-sidebar">
            <div>
              <p class="eyebrow">Session</p>
              <dl id="terminal-metadata" class="meta-grid">
                ${renderTerminalMetadata(session)}
              </dl>
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
        <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
        <button class="sidebar-toggle" id="sidebar-toggle" type="button" title="Toggle sidebar">\u2630</button>
      </div>
    `;

    document.querySelector("#back-button").addEventListener("click", () => {
      location.hash = "#/";
    });
    bindNavDrawer();

    // Sidebar toggle for mobile
    const sidebarToggle = document.querySelector("#sidebar-toggle");
    const sidebar = document.querySelector("#terminal-sidebar");
    const backdrop = document.querySelector("#sidebar-backdrop");
    if (sidebarToggle && sidebar && backdrop) {
      function toggleSidebar() {
        const isOpen = sidebar.classList.toggle("open");
        backdrop.classList.toggle("open", isOpen);
        sidebarToggle.textContent = isOpen ? "\u2715" : "\u2630";
      }
      sidebarToggle.addEventListener("click", toggleSidebar);
      backdrop.addEventListener("click", toggleSidebar);
    }

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
    if (summary) summary.textContent = `${session.provider} \u00b7 ${session.displayState}`;
    if (statePill) statePill.textContent = session.displayState;
    if (metadata) metadata.innerHTML = renderTerminalMetadata(session);
    if (logs) logs.textContent = (session.logs || []).slice(-60).join("\n") || "No logs captured yet.";
  }

  function renderTerminalMetadata(session) {
    if (!session) {
      return `<dt>Status</dt><dd>Loading\u2026</dd>`;
    }
    let html = `
      <dt>Provider</dt><dd>${escapeHtml(session.provider)}</dd>
      <dt>Mode</dt><dd>${escapeHtml(session.mode)}</dd>
      <dt>Transport</dt><dd>${escapeHtml(session.transport || "pty")}</dd>
      <dt>Status</dt><dd>${escapeHtml(session.status)}</dd>
      <dt>CWD</dt><dd><code>${escapeHtml(session.cwd)}</code></dd>
      <dt>Command</dt><dd><code>${escapeHtml(session.command || "hooked session")}</code></dd>
      <dt>PID</dt><dd>${session.pid || "\u2014"}</dd>
    `;
    if (session.meta && session.meta.tmuxSession) {
      html += `<dt>tmux</dt><dd><code>${escapeHtml(session.meta.tmuxSession)}</code></dd>`;
    }
    if (session.meta && session.meta.localAttachCommand) {
      html += `<dt>Attach</dt><dd><code>${escapeHtml(session.meta.localAttachCommand)}</code></dd>`;
    }
    return html;
  }

  function render() {
    if (route().name === "terminal") {
      renderTerminal();
      return;
    }
    renderWorkshop();
  }

  function providerIcon(provider) {
    if (provider === "claude") {
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
    }
    if (provider === "codex") {
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;
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
