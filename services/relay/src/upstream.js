const crypto = require("node:crypto");

const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 90000;

const AUTH_TIMEOUT_MS = 10000;

function describeUpstreamClose({ code, reason }) {
  const parts = [];

  if (typeof code === "number") {
    parts.push(`code=${code}`);
  }

  if (reason) {
    parts.push(`reason=${reason}`);
  }

  return parts.length > 0 ? parts.join(" ") : "no close details";
}

function createUpstreamManager({ verifyKey }) {
  const tunnels = new Map();

  function nextReqId() {
    return `r_${crypto.randomBytes(6).toString("hex")}`;
  }

  function nextConnId() {
    return `c_${crypto.randomBytes(6).toString("hex")}`;
  }

  function handleUpstream(ws) {
    // Wait for the first message to be an auth message
    const authTimeout = setTimeout(() => {
      ws.close(4401, "auth_timeout");
    }, AUTH_TIMEOUT_MS);

    ws.once("message", async (raw) => {
      clearTimeout(authTimeout);

      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        ws.close(4401, "invalid_auth_message");
        return;
      }

      if (msg.type !== "auth" || !msg.key) {
        ws.send(JSON.stringify({ type: "auth:error", error: "expected auth message" }));
        ws.close(4401, "expected_auth");
        return;
      }

      const verified = await verifyKey(msg.key);
      const userId = typeof verified === "string" ? verified : verified?.userId;
      const keyId = typeof verified === "string" ? null : verified?.keyId || null;
      if (!userId) {
        ws.send(JSON.stringify({ type: "auth:error", error: "invalid_key" }));
        ws.close(4401, "invalid_key");
        return;
      }

      // Auth successful
      ws.send(JSON.stringify({ type: "auth:ok", userId }));

      const existing = tunnels.get(userId);
      if (existing) {
        existing.ws.close(4409, "replaced");
      }

      const tunnel = {
        ws,
        userId,
        keyId,
        connectedAt: new Date().toISOString(),
        lastPingAt: Date.now(),
        pendingRequests: new Map(),
        pendingWs: new Map()
      };
      tunnels.set(userId, tunnel);

      ws.on("message", (raw) => {
        const str = String(raw);
        // Fast path: WS data forwarding uses "W:${connId}:${data}" prefix (no JSON parse)
        if (str.startsWith("W:")) {
          const connId = str.slice(2, 16);
          const data = str.slice(17);
          const wsEntry = tunnel.pendingWs.get(connId);
          if (wsEntry && wsEntry.readyState === 1) {
            wsEntry.send(data);
          }
          return;
        }
        // Control messages remain JSON
        try {
          const msg = JSON.parse(str);
          handleUpstreamMessage(tunnel, msg);
        } catch {
          // Ignore malformed messages.
        }
      });

      ws.on("close", (code, reasonBuffer) => {
        const reason = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString("utf8") : String(reasonBuffer || "");
        console.log(`[relay] upstream disconnected: userId=${userId} ${describeUpstreamClose({ code, reason })}`);
        if (tunnels.get(userId) === tunnel) {
          tunnels.delete(userId);
        }
        // Immediately fail all in-flight HTTP requests instead of letting them time out.
        for (const pending of tunnel.pendingRequests.values()) {
          pending.resolve(null);
        }
        tunnel.pendingRequests.clear();
        // Close browser WebSocket connections tied to this tunnel.
        for (const browserWs of tunnel.pendingWs.values()) {
          if (browserWs.readyState === 1) {
            browserWs.close(4502, "tunnel_offline");
          }
        }
        tunnel.pendingWs.clear();
      });

      ws.on("pong", () => {
        tunnel.lastPingAt = Date.now();
      });

      console.log(`[relay] upstream connected: userId=${userId}`);
    });
  }

  function disconnectTunnels({ userId = null, keyId = null, reason = "key_revoked" } = {}) {
    for (const [tunnelUserId, tunnel] of tunnels) {
      const matchesUser = userId ? tunnelUserId === userId : true;
      const matchesKey = keyId ? tunnel.keyId === keyId : true;
      if (!matchesUser || !matchesKey) {
        continue;
      }
      if (tunnel.ws.readyState === 1) {
        tunnel.ws.close(4401, reason);
      }
      tunnels.delete(tunnelUserId);
    }
  }

  function handleUpstreamMessage(tunnel, msg) {
    if (msg.type === "http:response") {
      const pending = tunnel.pendingRequests.get(msg.reqId);
      if (pending) {
        tunnel.pendingRequests.delete(msg.reqId);
        pending.resolve(msg);
      }
      return;
    }
    if (msg.type === "ws:close") {
      const wsEntry = tunnel.pendingWs.get(msg.connId);
      if (wsEntry) {
        tunnel.pendingWs.delete(msg.connId);
        wsEntry.close();
      }
      return;
    }
    if (msg.type === "status:summary") {
      tunnel.statusSummary = msg.sessions || [];
      tunnel.statusUpdatedAt = new Date().toISOString();
      return;
    }
  }

  function sendHttpRequest(userId, { method, path, headers, body }) {
    const tunnel = tunnels.get(userId);
    if (!tunnel || tunnel.ws.readyState !== 1) {
      return Promise.resolve(null);
    }

    const reqId = nextReqId();
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        tunnel.pendingRequests.delete(reqId);
        resolve(null);
      }, 30000);

      tunnel.pendingRequests.set(reqId, {
        resolve: (msg) => {
          clearTimeout(timeout);
          resolve(msg);
        }
      });

      tunnel.ws.send(JSON.stringify({
        type: "http:request",
        reqId,
        method,
        path,
        headers: headers || {},
        body: body || ""
      }));
    });
  }

  function openWsConnection(userId, browserWs, wsPath) {
    const tunnel = tunnels.get(userId);
    if (!tunnel || tunnel.ws.readyState !== 1) {
      browserWs.close(4502, "tunnel_offline");
      return;
    }

    const connId = nextConnId();
    tunnel.pendingWs.set(connId, browserWs);

    tunnel.ws.send(JSON.stringify({
      type: "ws:open",
      connId,
      path: wsPath
    }));

    browserWs.on("message", (raw) => {
      if (tunnel.ws.readyState === 1) {
        // Fast path: prefix with connId, no JSON wrapping
        tunnel.ws.send(`W:${connId}:${String(raw)}`);
      }
    });

    browserWs.on("close", () => {
      tunnel.pendingWs.delete(connId);
      if (tunnel.ws.readyState === 1) {
        tunnel.ws.send(JSON.stringify({
          type: "ws:close",
          connId
        }));
      }
    });
  }

  function isOnline(userId) {
    const tunnel = tunnels.get(userId);
    return Boolean(tunnel && tunnel.ws.readyState === 1);
  }

  function getStatusSummary(userId) {
    const tunnel = tunnels.get(userId);
    if (!tunnel) {
      return null;
    }
    return {
      online: tunnel.ws.readyState === 1,
      sessions: tunnel.statusSummary || [],
      statusUpdatedAt: tunnel.statusUpdatedAt || null,
      connectedAt: tunnel.connectedAt
    };
  }

  // Heartbeat
  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [userId, tunnel] of tunnels) {
      if (now - tunnel.lastPingAt > HEARTBEAT_TIMEOUT_MS) {
        console.log(`[relay] heartbeat timeout: userId=${userId}`);
        tunnel.ws.terminate();
        tunnels.delete(userId);
        continue;
      }
      if (tunnel.ws.readyState === 1) {
        tunnel.ws.ping();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  heartbeatTimer.unref();

  return {
    handleUpstream,
    sendHttpRequest,
    openWsConnection,
    isOnline,
    getStatusSummary,
    disconnectTunnels,
    get tunnelCount() {
      return tunnels.size;
    }
  };
}

module.exports = {
  createUpstreamManager,
  describeUpstreamClose
};
