const { WebSocket } = require("ws");
const { toSessionSummary } = require("./core");

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
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

function createTunnelClient({ key, relayUrl, localServerUrl }) {
  let ws = null;
  let reconnectDelay = RECONNECT_BASE_MS;
  let stopped = false;
  let authenticated = false;
  let pendingStatusSummary = [];

  function flushStatusSummary() {
    if (!authenticated || !ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify({
      type: "status:summary",
      sessions: pendingStatusSummary
    }));
  }

  function connect() {
    if (stopped) {
      return;
    }

    authenticated = false;
    const url = `${relayUrl.replace(/^http/, "ws")}/upstream`;
    ws = new WebSocket(url);

    ws.on("open", () => {
      reconnectDelay = RECONNECT_BASE_MS;
      console.log("[tunnel] connected to relay, authenticating...");
      ws.send(JSON.stringify({ type: "auth", key }));
    });

    ws.on("message", async (raw) => {
      try {
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
          authenticated = true;
          console.log(`[tunnel] authenticated with relay: ${relayUrl} (userId=${msg.userId})`);
          flushStatusSummary();
          return;
        }
        if (msg.type === "auth:error") {
          console.error(`[tunnel] authentication failed: ${msg.error || "invalid key"}`);
          stopped = true;
          ws.close();
          return;
        }

        if (!authenticated) {
          return;
        }

        await handleRelayMessage(msg);
      } catch (err) {
        console.error(`[tunnel] message error: ${err.message}`);
      }
    });

    ws.on("close", (code) => {
      if (stopped) {
        return;
      }
      if (code === 4401) {
        console.error("[tunnel] authentication rejected by relay. Not reconnecting.");
        stopped = true;
        return;
      }
      console.log(`[tunnel] disconnected (${code}). Reconnecting in ${reconnectDelay}ms...`);
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
        connect();
      }, reconnectDelay);
    });

    ws.on("error", (err) => {
      console.error(`[tunnel] ws error: ${err.message}`);
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
    sendStatusSummary,
    stop
  };
}

module.exports = {
  buildLocalRequestHeaders,
  createTunnelClient
};
