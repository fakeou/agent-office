const { WebSocket } = require("ws");

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

function createTunnelClient({ key, relayUrl, localServerUrl }) {
  let ws = null;
  let reconnectDelay = RECONNECT_BASE_MS;
  let stopped = false;
  let authenticated = false;

  function connect() {
    if (stopped) {
      return;
    }

    authenticated = false;
    // Connect without key in URL — auth happens via first message
    const url = `${relayUrl.replace(/^http/, "ws")}/upstream`;
    ws = new WebSocket(url);

    ws.on("open", () => {
      reconnectDelay = RECONNECT_BASE_MS;
      console.log(`[tunnel] connected to relay, authenticating...`);
      // Send auth as first message instead of URL param
      ws.send(JSON.stringify({ type: "auth", key }));
    });

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(String(raw));

        // Handle auth response before processing other messages
        if (msg.type === "auth:ok") {
          authenticated = true;
          console.log(`[tunnel] authenticated with relay: ${relayUrl} (userId=${msg.userId})`);
          return;
        }
        if (msg.type === "auth:error") {
          console.error(`[tunnel] authentication failed: ${msg.error || "invalid key"}`);
          // Don't reconnect on auth failure
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

    ws.on("close", (code, reason) => {
      if (stopped) {
        return;
      }
      // Don't reconnect on auth rejection
      if (code === 4401) {
        console.error(`[tunnel] authentication rejected by relay. Not reconnecting.`);
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
    if (msg.type === "ws:message") {
      handleWsMessage(msg);
      return;
    }
    if (msg.type === "ws:close") {
      handleWsClose(msg);
      return;
    }
  }

  async function handleHttpRequest(msg) {
    try {
      const fetchUrl = `${localServerUrl}${msg.path}`;
      const fetchOptions = {
        method: msg.method || "GET",
        headers: { ...msg.headers, host: new URL(localServerUrl).host }
      };
      if (msg.body && msg.method !== "GET" && msg.method !== "HEAD") {
        fetchOptions.body = msg.body;
        fetchOptions.headers["content-type"] = fetchOptions.headers["content-type"] || "application/json";
      }

      const response = await fetch(fetchUrl, fetchOptions);
      const body = await response.text();
      const responseHeaders = {};
      for (const [k, v] of response.headers) {
        if (!["transfer-encoding", "connection", "content-encoding"].includes(k.toLowerCase())) {
          responseHeaders[k] = v;
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
    const localWsUrl = `${localServerUrl.replace(/^http/, "ws")}${msg.path}`;
    const localWs = new WebSocket(localWsUrl);

    localWsConnections.set(msg.connId, localWs);

    localWs.on("message", (data) => {
      sendToRelay({
        type: "ws:message",
        connId: msg.connId,
        data: String(data)
      });
    });

    localWs.on("close", () => {
      localWsConnections.delete(msg.connId);
      sendToRelay({
        type: "ws:close",
        connId: msg.connId
      });
    });

    localWs.on("error", () => {
      localWsConnections.delete(msg.connId);
    });
  }

  function handleWsMessage(msg) {
    const localWs = localWsConnections.get(msg.connId);
    if (localWs && localWs.readyState === WebSocket.OPEN) {
      localWs.send(msg.data);
    }
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
    sendToRelay({
      type: "status:summary",
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        provider: s.provider,
        displayState: s.displayState,
        title: s.title
      }))
    });
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
  createTunnelClient
};
