const { WebSocket } = require("ws");
const { toSessionSummary } = require("./core");
const { createTunnelLogger, describeWebSocketClose } = require("./runtime/tunnel-log");

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const AUTH_RESPONSE_TIMEOUT_MS = 15000;
const STALE_UPSTREAM_TIMEOUT_MS = 70000;
const WATCHDOG_INTERVAL_MS = 5000;
const LOCAL_PROXY_STRIP_HEADERS = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "cookie",
  "origin",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function shouldStripLocalProxyHeader(name) {
  return (
    LOCAL_PROXY_STRIP_HEADERS.has(name) ||
    name.startsWith("proxy-") ||
    name.startsWith("sec-") ||
    name.startsWith("x-forwarded-")
  );
}

function buildLocalRequestHeaders(headers, localServerUrl) {
  const nextHeaders = {};

  for (const [name, rawValue] of Object.entries(headers || {})) {
    const key = String(name).toLowerCase();
    if (shouldStripLocalProxyHeader(key) || rawValue == null) {
      continue;
    }
    nextHeaders[key] = Array.isArray(rawValue) ? rawValue.join(", ") : String(rawValue);
  }

  nextHeaders.host = new URL(localServerUrl).host;
  return nextHeaders;
}

const TERMINAL_AUTH_REASONS = new Set([
  "invalid_key",
  "key_revoked"
]);

function isTerminalAuthFailure({ code, reason, error }) {
  if (error) {
    return TERMINAL_AUTH_REASONS.has(error);
  }
  if (code !== 4401) {
    return false;
  }
  return TERMINAL_AUTH_REASONS.has(reason);
}

function closeSocket(socket) {
  if (!socket) {
    return;
  }
  if (typeof socket.terminate === "function") {
    socket.terminate();
    return;
  }
  socket.close();
}

function createTunnelClient({
  key,
  relayUrl,
  localServerUrl,
  logger = createTunnelLogger(),
  reconnectBaseMs = RECONNECT_BASE_MS,
  reconnectMaxMs = RECONNECT_MAX_MS,
  authResponseTimeoutMs = AUTH_RESPONSE_TIMEOUT_MS,
  staleUpstreamTimeoutMs = STALE_UPSTREAM_TIMEOUT_MS,
  watchdogIntervalMs = WATCHDOG_INTERVAL_MS
}) {
  let ws = null;
  let reconnectDelay = reconnectBaseMs;
  let stopped = false;
  let authenticated = false;
  let pendingStatusSummary = [];
  let reconnectTimer = null;

  function flushStatusSummary() {
    if (!authenticated || !ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify({
      type: "status:summary",
      sessions: pendingStatusSummary
    }));
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) {
      return;
    }

    const delay = reconnectDelay;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, reconnectMaxMs);
      connect();
    }, delay);
    reconnectTimer.unref?.();
  }

  function connect() {
    if (stopped) {
      return;
    }

    authenticated = false;
    const url = `${relayUrl.replace(/^http/, "ws")}/upstream`;
    const socket = new WebSocket(url);
    let socketAuthenticated = false;
    let lastActivityAt = Date.now();

    function markActivity() {
      lastActivityAt = Date.now();
    }

    const watchdogTimer = setInterval(() => {
      if (stopped || ws !== socket) {
        return;
      }

      const idleForMs = Date.now() - lastActivityAt;
      if (!socketAuthenticated) {
        if (idleForMs < authResponseTimeoutMs) {
          return;
        }
        logger.error(`[tunnel] auth response timeout after ${idleForMs}ms. Terminating socket and retrying.`);
        closeSocket(socket);
        return;
      }

      if (idleForMs < staleUpstreamTimeoutMs) {
        return;
      }

      logger.error(`[tunnel] upstream stale for ${idleForMs}ms. Terminating socket and reconnecting.`);
      closeSocket(socket);
    }, watchdogIntervalMs);
    watchdogTimer.unref?.();

    ws = socket;

    socket.on("open", () => {
      markActivity();
      logger.info("[tunnel] connected to relay, authenticating...");
      socket.send(JSON.stringify({ type: "auth", key }));
    });

    socket.on("ping", markActivity);
    socket.on("pong", markActivity);

    socket.on("message", async (raw) => {
      try {
        if (ws !== socket) {
          return;
        }

        markActivity();
        const str = String(raw);

        // Fast path: WS data forwarding uses "W:${connId}:${data}" prefix (no JSON parse)
        if (str.startsWith("W:")) {
          const connId = str.slice(2, 16);
          const data = str.slice(17);
          const localWs = localWsConnections.get(connId);
          if (localWs && localWs.readyState === WebSocket.OPEN) {
            localWs.send(data);
          }
          return;
        }

        const msg = JSON.parse(str);

        if (msg.type === "auth:ok") {
          socketAuthenticated = true;
          authenticated = true;
          reconnectDelay = reconnectBaseMs;
          logger.info(`[tunnel] authenticated with relay: ${relayUrl} (userId=${msg.userId})`);
          flushStatusSummary();
          return;
        }
        if (msg.type === "auth:error") {
          logger.error(`[tunnel] authentication failed: ${msg.error || "invalid key"}`);
          if (isTerminalAuthFailure({ error: msg.error })) {
            stopped = true;
          }
          socket.close();
          return;
        }

        if (!authenticated) {
          return;
        }

        await handleRelayMessage(msg);
      } catch (err) {
        logger.error(`[tunnel] message error: ${err.message}`);
      }
    });

    socket.on("close", (code, reasonBuffer) => {
      clearInterval(watchdogTimer);
      if (ws === socket) {
        ws = null;
      }
      const reason = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString("utf8") : String(reasonBuffer || "");
      const closeDetails = describeWebSocketClose({ code, reason });
      if (stopped) {
        logger.info(`[tunnel] stopped with close ${closeDetails}`);
        return;
      }
      if (isTerminalAuthFailure({ code, reason })) {
        logger.error(`[tunnel] authentication rejected by relay (${closeDetails}). Not reconnecting.`);
        stopped = true;
        return;
      }
      logger.info(`[tunnel] disconnected (${closeDetails}). Reconnecting in ${reconnectDelay}ms...`);
      scheduleReconnect();
    });

    socket.on("error", (err) => {
      logger.error(`[tunnel] ws error: ${err.message}`);
    });
  }

  async function handleRelayMessage(msg) {
    if (msg.type === "http:request") {
      await handleHttpRequest(msg);
      return;
    }
    if (msg.type === "ws:open") {
      handleWsOpen(msg);
      return;
    }
    if (msg.type === "ws:close") {
      handleWsClose(msg);
    }
  }

  async function handleHttpRequest(msg) {
    try {
      const fetchUrl = `${localServerUrl}${msg.path}`;
      const fetchOptions = {
        method: msg.method || "GET",
        headers: buildLocalRequestHeaders(msg.headers, localServerUrl)
      };
      if (msg.body && msg.method !== "GET" && msg.method !== "HEAD") {
        fetchOptions.body = msg.body;
        fetchOptions.headers["content-type"] = fetchOptions.headers["content-type"] || "application/json";
      }

      const response = await fetch(fetchUrl, fetchOptions);
      const body = await response.text();
      const responseHeaders = {};
      for (const [keyName, value] of response.headers) {
        if (!["transfer-encoding", "connection", "content-encoding"].includes(keyName.toLowerCase())) {
          responseHeaders[keyName] = value;
        }
      }

      sendToRelay({
        type: "http:response",
        reqId: msg.reqId,
        status: response.status,
        headers: responseHeaders,
        body
      });
    } catch (err) {
      sendToRelay({
        type: "http:response",
        reqId: msg.reqId,
        status: 502,
        headers: {},
        body: JSON.stringify({ error: err.message })
      });
    }
  }

  const localWsConnections = new Map();

  function handleWsOpen(msg) {
    const connId = msg.connId;
    const localWsUrl = `${localServerUrl.replace(/^http/, "ws")}${msg.path}`;
    const localWs = new WebSocket(localWsUrl);

    localWsConnections.set(connId, localWs);

    localWs.on("message", (data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Fast path: prefix with connId, no JSON wrapping
        ws.send(`W:${connId}:${String(data)}`);
      }
    });

    localWs.on("close", () => {
      localWsConnections.delete(connId);
      sendToRelay({
        type: "ws:close",
        connId
      });
    });

    localWs.on("error", () => {
      localWsConnections.delete(connId);
    });
  }

  function handleWsClose(msg) {
    const localWs = localWsConnections.get(msg.connId);
    if (localWs) {
      localWsConnections.delete(msg.connId);
      localWs.close();
    }
  }

  function sendToRelay(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function sendStatusSummary(sessions) {
    pendingStatusSummary = sessions
      .map((session) => toSessionSummary(session))
      .filter(Boolean);
    flushStatusSummary();
  }

  function stop() {
    stopped = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    for (const localWs of localWsConnections.values()) {
      localWs.close();
    }
    localWsConnections.clear();
    if (ws) {
      ws.close();
    }
  }

  connect();

  return {
    logPath: logger.logPath,
    sendStatusSummary,
    stop
  };
}

module.exports = {
  buildLocalRequestHeaders,
  createTunnelClient
};
