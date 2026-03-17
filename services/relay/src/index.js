try {
  process.loadEnvFile?.();
} catch {}

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const express = require("express");
const jwt = require("jsonwebtoken");
const { WebSocketServer } = require("ws");
const { createUpstreamManager } = require("./upstream");
const { createProxy } = require("./proxy");
const { createStatusManager } = require("./status");

function createRelayServer({ port = 9000, host = "0.0.0.0", verifyKey, jwtSecret, apiUrl } = {}) {
  if (!verifyKey) {
    throw new Error("verifyKey function is required");
  }

  const upstream = createUpstreamManager({ verifyKey });
  const proxy = createProxy({ upstream });
  const status = createStatusManager({ upstream });
  const browserSocketsByUser = new Map();
  const browserSocketsBySession = new Map();

  function addIndexedSocket(map, key, ws) {
    if (!key) {
      return;
    }
    const set = map.get(key) || new Set();
    set.add(ws);
    map.set(key, set);
  }

  function removeIndexedSocket(map, key, ws) {
    if (!key) {
      return;
    }
    const set = map.get(key);
    if (!set) {
      return;
    }
    set.delete(ws);
    if (set.size === 0) {
      map.delete(key);
    }
  }

  function registerBrowserSocket(ws, { userId = null, sessionId = null } = {}) {
    addIndexedSocket(browserSocketsByUser, userId, ws);
    addIndexedSocket(browserSocketsBySession, sessionId, ws);
    ws.on("close", () => {
      removeIndexedSocket(browserSocketsByUser, userId, ws);
      removeIndexedSocket(browserSocketsBySession, sessionId, ws);
    });
  }

  function disconnectBrowserSockets({ userId = null, sessionId = null, reason = "token_revoked" } = {}) {
    const targets = new Set();
    if (sessionId && browserSocketsBySession.has(sessionId)) {
      for (const ws of browserSocketsBySession.get(sessionId)) {
        targets.add(ws);
      }
    }
    if (userId && browserSocketsByUser.has(userId)) {
      for (const ws of browserSocketsByUser.get(userId)) {
        targets.add(ws);
      }
    }
    for (const ws of targets) {
      if (ws.readyState === 1) {
        ws.close(4401, reason);
      }
    }
  }

  // --- JWT verification helpers ---

  const jwtCache = new Map();
  const JWT_CACHE_TTL_MS = 60 * 1000;

  const cacheCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of jwtCache) {
      if (now - entry.cachedAt > JWT_CACHE_TTL_MS) {
        jwtCache.delete(key);
      }
    }
  }, 2 * 60 * 1000);
  cacheCleanupTimer.unref();

  function localVerifyJwt(token) {
    if (!jwtSecret) return null;
    try {
      const payload = jwt.verify(token, jwtSecret);
      return {
        userId: payload.sub || null,
        sessionId: payload.sid || null,
        error: payload.sub ? null : "invalid_token",
        expiresAt: typeof payload.exp === "number" ? payload.exp * 1000 : null
      };
    } catch (error) {
      if (error && error.name === "TokenExpiredError") {
        return { userId: null, sessionId: null, error: "token_expired", expiresAt: null };
      }
      return { userId: null, sessionId: null, error: "invalid_token", expiresAt: null };
    }
  }

  function signWsToken({ userId, sessionId = null, expiresAt }) {
    if (!jwtSecret || !userId || !expiresAt) {
      return null;
    }

    const expiresInSeconds = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
    const payload = { sub: userId, typ: "agentoffice_ws" };
    if (sessionId) {
      payload.sid = sessionId;
    }
    return jwt.sign(payload, jwtSecret, { expiresIn: expiresInSeconds });
  }

  function verifyWsToken(token) {
    if (!jwtSecret) {
      return { userId: null, sessionId: null, error: "invalid_token", expiresAt: null };
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      if (payload.typ !== "agentoffice_ws") {
        return { userId: null, error: "invalid_token", expiresAt: null };
      }
      return {
        userId: payload.sub || null,
        sessionId: payload.sid || null,
        error: payload.sub ? null : "invalid_token",
        expiresAt: typeof payload.exp === "number" ? payload.exp * 1000 : null
      };
    } catch (error) {
      if (error && error.name === "TokenExpiredError") {
        return { userId: null, sessionId: null, error: "token_expired", expiresAt: null };
      }
      return { userId: null, sessionId: null, error: "invalid_token", expiresAt: null };
    }
  }

  async function verifyTunnelJwt(token) {
    // Fast local check first — rejects invalid signatures immediately
    const localVerification = localVerifyJwt(token);
    if (!localVerification || !localVerification.userId) {
      return {
        userId: null,
        sessionId: localVerification?.sessionId || null,
        error: localVerification?.error || "invalid_token",
        expiresAt: localVerification?.expiresAt || null
      };
    }
    const userId = localVerification.userId;
    const sessionId = localVerification.sessionId || null;

    // Check cache
    const cached = jwtCache.get(token);
    if (cached && Date.now() - cached.cachedAt < JWT_CACHE_TTL_MS) {
      return {
        userId: cached.userId,
        sessionId: cached.sessionId || sessionId,
        error: null,
        expiresAt: localVerification.expiresAt || null
      };
    }

    // Call API for revocation check
    if (apiUrl) {
      try {
        const response = await fetch(`${apiUrl}/api/internal/verify-jwt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
        if (response.ok) {
          const data = await response.json();
          const verifiedUserId = data.userId || null;
          const verifiedSessionId = data.sessionId || sessionId;
          if (verifiedUserId) {
            jwtCache.set(token, { userId: verifiedUserId, sessionId: verifiedSessionId, cachedAt: Date.now() });
          }
          return {
            userId: verifiedUserId,
            sessionId: verifiedSessionId,
            error: verifiedUserId ? null : "invalid_token",
            expiresAt: localVerification.expiresAt || null
          };
        }
        // Token revoked or invalid per API
        const data = await response.json().catch(() => null);
        return {
          userId: null,
          sessionId,
          error: data?.error || "invalid_token",
          expiresAt: localVerification.expiresAt || null
        };
      } catch {
        // API unreachable — graceful degradation to local-only verification
        jwtCache.set(token, { userId, sessionId, cachedAt: Date.now() });
        return { userId, sessionId, error: null, expiresAt: localVerification.expiresAt || null };
      }
    }

    // No API URL configured — local verification only
    jwtCache.set(token, { userId, sessionId, cachedAt: Date.now() });
    return { userId, sessionId, error: null, expiresAt: localVerification.expiresAt || null };
  }

  function extractBearerToken(req) {
    const authHeader = req.headers?.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }
    return null;
  }

  function isLoopbackIp(ip = "") {
    return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip);
  }

  // --- Express app ---

  const app = express();
  app.set("trust proxy", true);

  // CORS for local dev (Vite dev server on localhost:51xx)
  app.use((req, res, next) => {
    const origin = req.headers.origin || "";
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).end();
    }
    next();
  });

  app.use(express.json({ limit: "1mb" }));

  // Serve static web assets (register.html, login pages, etc.)
  let staticDir = null;
  try {
    const { STATIC_DIR } = require("@agent-office/web");
    staticDir = STATIC_DIR;
    app.use(express.static(STATIC_DIR));
  } catch {
    // @agent-office/web not available — skip static file serving
  }

  function serveTunnelStatic(tunnelPath, res) {
    if (!staticDir) {
      res.status(404).end();
      return;
    }

    const relativePath = tunnelPath === "/" ? "/office.html" : tunnelPath;
    const normalizedPath = path.posix.normalize(relativePath);
    const requestedPath = normalizedPath.startsWith("/") ? normalizedPath.slice(1) : normalizedPath;
    const safePath = requestedPath && requestedPath !== "." ? requestedPath : "office.html";
    const absolutePath = path.resolve(staticDir, safePath);
    const resolvedStaticDir = path.resolve(staticDir);

    if (!absolutePath.startsWith(resolvedStaticDir + path.sep) && absolutePath !== path.join(resolvedStaticDir, "office.html")) {
      res.status(403).end();
      return;
    }

    const targetPath = fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()
      ? absolutePath
      : path.join(resolvedStaticDir, "office.html");

    res.sendFile(targetPath);
  }

  // Health
  app.get("/api/relay/health", (_req, res) => {
    res.json({ ok: true, tunnels: upstream.tunnelCount });
  });

  const internalSecret = process.env.AGENTOFFICE_INTERNAL_SECRET || jwtSecret || "";

  function requireInternalAuth(req, res, next) {
    if (internalSecret) {
      const token = req.headers["x-agentoffice-internal-secret"];
      if (token !== internalSecret) {
        return res.status(401).json({ error: "invalid_internal_secret" });
      }
      return next();
    }

    if (!isLoopbackIp(req.ip)) {
      return res.status(403).json({ error: "internal_loopback_only" });
    }
    next();
  }

  app.post("/api/ws-token", async (req, res) => {
    if (!jwtSecret) {
      return res.status(400).json({ error: "ws_token_auth_disabled" });
    }

    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "missing_token" });
    }

    const verification = await verifyTunnelJwt(token);
    if (!verification.userId) {
      return res.status(401).json({ error: verification.error || "invalid_token" });
    }

    const wsToken = signWsToken({
      userId: verification.userId,
      sessionId: verification.sessionId || null,
      expiresAt: verification.expiresAt
    });
    if (!wsToken || !verification.expiresAt) {
      return res.status(500).json({ error: "ws_token_issue_failed" });
    }

    res.json({
      wsToken,
      expiresAt: new Date(verification.expiresAt).toISOString()
    });
  });

  app.post("/api/internal/disconnect", requireInternalAuth, (req, res) => {
    const { userId = null, sessionId = null, keyId = null, reason = "token_revoked" } = req.body || {};

    // Key revocation should only drop agent tunnels for that key, not browser event sockets.
    if (reason !== "key_revoked") {
      disconnectBrowserSockets({ userId, sessionId, reason });
    }
    if (keyId) {
      upstream.disconnectTunnels({ userId, keyId, reason });
    }

    res.json({ ok: true });
  });

  // User status (for Phase 4 social)
  app.get("/api/users/:userId/status", (req, res) => {
    const userStatus = status.getUserStatus(req.params.userId);
    if (!userStatus) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    res.json(userStatus);
  });

  // --- Tunnel auth middleware ---
  async function tunnelAuthMiddleware(req, res, next) {
    // No jwtSecret = dev mode, skip auth
    if (!jwtSecret) {
      return next();
    }

    const token = extractBearerToken(req);
    if (!token) {
      // API clients get JSON 401; browsers get redirect
      const acceptsJson = (req.headers.accept || "").includes("application/json");
      if (acceptsJson) {
        return res.status(401).json({ error: "missing_token" });
      }
      return res.redirect("/register.html");
    }

    const verification = await verifyTunnelJwt(token);
    if (!verification.userId) {
      const acceptsJson = (req.headers.accept || "").includes("application/json");
      if (acceptsJson) {
        return res.status(401).json({ error: verification.error || "invalid_token" });
      }
      return res.redirect("/register.html");
    }

    // Check that JWT user matches the tunnel userId
    if (verification.userId !== req.params.userId) {
      return res.status(403).json({ error: "forbidden" });
    }

    req.jwtUserId = verification.userId;
    req.jwtSessionId = verification.sessionId || null;
    next();
  }

  // Proxy HTTP requests to user's tunnel. Static office shell/assets are served by Relay.
  app.all("/tunnel/:userId/*", (req, res) => {
    const { userId } = req.params;
    const tunnelPath = req.originalUrl.replace(`/tunnel/${userId}`, "") || "/";

    if ((req.method === "GET" || req.method === "HEAD") && !tunnelPath.startsWith("/api/") && !tunnelPath.startsWith("/ws/")) {
      serveTunnelStatic(tunnelPath, res);
      return;
    }

    tunnelAuthMiddleware(req, res, () => {
      if (!upstream.isOnline(userId)) {
        res.status(502).json({ error: "tunnel_offline" });
        return;
      }
      // Rewrite path: /tunnel/:userId/api/sessions -> /api/sessions
      req.originalUrl = tunnelPath;
      proxy.handleHttpProxy(req, res, userId);
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    // Upstream connection from local AgentOffice (auth moved to ws.once("message"))
    if (pathname === "/upstream") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        upstream.handleUpstream(ws);
      });
      return;
    }

    // Browser WS proxy: /tunnel/:userId/ws/events etc.
    const tunnelWsMatch = pathname.match(/^\/tunnel\/([^/]+)(\/ws\/.*)$/);
    if (tunnelWsMatch) {
      const userId = tunnelWsMatch[1];
      const wsPath = tunnelWsMatch[2];
      let authExpiresAt = null;
      let authSessionId = null;

      // JWT auth for WS upgrade (token via query param since WS doesn't support custom headers)
      if (jwtSecret) {
        const wsToken = url.searchParams.get("wsToken");
        const token = url.searchParams.get("token");
        if (!wsToken && !token) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        const verification = wsToken ? verifyWsToken(wsToken) : await verifyTunnelJwt(token);
        if (!verification.userId) {
          socket.write(`HTTP/1.1 401 Unauthorized\r\nX-AgentOffice-Auth-Error: ${verification.error || "invalid_token"}\r\n\r\n`);
          socket.destroy();
          return;
        }
        if (verification.userId !== userId) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
        authExpiresAt = verification.expiresAt || null;
        authSessionId = verification.sessionId || null;
      }

      if (!upstream.isOnline(userId)) {
        socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        registerBrowserSocket(ws, { userId, sessionId: authSessionId });
        if (authExpiresAt) {
          const delay = authExpiresAt - Date.now();
          if (delay <= 0) {
            ws.close(4401, "token_expired");
            return;
          }
          const expiryTimer = setTimeout(() => {
            if (ws.readyState === 1) {
              ws.close(4401, "token_expired");
            }
          }, delay);
          if (typeof expiryTimer.unref === "function") {
            expiryTimer.unref();
          }
          ws.on("close", () => {
            clearTimeout(expiryTimer);
          });
        }
        proxy.handleWsProxy(ws, userId, wsPath);
      });
      return;
    }

    // User status WS (Phase 4 social events)
    const statusWsMatch = pathname.match(/^\/ws\/users\/([^/]+)\/events$/);
    if (statusWsMatch) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        // Placeholder for Phase 4 social status streaming
        ws.send(JSON.stringify({ type: "connected", userId: statusWsMatch[1] }));
      });
      return;
    }

    socket.destroy();
  });

  server.listen(port, host, () => {
    console.log(`AgentOffice Relay listening on http://${host}:${port}`);
  });

  return { server, upstream, proxy, status };
}

// Standalone runner
if (require.main === module) {
  const apiUrl = process.env.AGENTOFFICE_API_URL || "http://127.0.0.1:9001";
  const jwtSecret = process.env.AGENTOFFICE_JWT_SECRET || null;

  // Verify key against the API to get the real userId
  async function verifyKey(key) {
    if (!key || !key.startsWith("sk_")) {
      return null;
    }
    try {
      const response = await fetch(`${apiUrl}/api/internal/verify-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!data.userId) {
        return null;
      }
      return {
        userId: data.userId,
        keyId: data.keyId || null
      };
    } catch {
      return null;
    }
  }

  const port = Number(process.env.RELAY_PORT || 9000);
  const host = process.env.RELAY_HOST || "0.0.0.0";
  createRelayServer({ port, host, verifyKey, jwtSecret, apiUrl });
}

module.exports = {
  createRelayServer
};
