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
      return payload.sub || null;
    } catch {
      return null;
    }
  }

  async function verifyTunnelJwt(token) {
    // Fast local check first — rejects invalid signatures immediately
    const userId = localVerifyJwt(token);
    if (!userId) return null;

    // Check cache
    const cached = jwtCache.get(token);
    if (cached && Date.now() - cached.cachedAt < JWT_CACHE_TTL_MS) {
      return cached.userId;
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
          if (verifiedUserId) {
            jwtCache.set(token, { userId: verifiedUserId, cachedAt: Date.now() });
          }
          return verifiedUserId;
        }
        // Token revoked or invalid per API
        return null;
      } catch {
        // API unreachable — graceful degradation to local-only verification
        jwtCache.set(token, { userId, cachedAt: Date.now() });
        return userId;
      }
    }

    // No API URL configured — local verification only
    jwtCache.set(token, { userId, cachedAt: Date.now() });
    return userId;
  }

  function extractBearerToken(req) {
    const authHeader = req.headers?.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }
    return null;
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
    const { STATIC_DIR } = require("@agenttown/web");
    staticDir = STATIC_DIR;
    app.use(express.static(STATIC_DIR));
  } catch {
    // @agenttown/web not available — skip static file serving
  }

  function serveTunnelStatic(tunnelPath, res) {
    if (!staticDir) {
      res.status(404).end();
      return;
    }

    const relativePath = tunnelPath === "/" ? "/workshop.html" : tunnelPath;
    const normalizedPath = path.posix.normalize(relativePath);
    const requestedPath = normalizedPath.startsWith("/") ? normalizedPath.slice(1) : normalizedPath;
    const safePath = requestedPath && requestedPath !== "." ? requestedPath : "workshop.html";
    const absolutePath = path.resolve(staticDir, safePath);
    const resolvedStaticDir = path.resolve(staticDir);

    if (!absolutePath.startsWith(resolvedStaticDir + path.sep) && absolutePath !== path.join(resolvedStaticDir, "workshop.html")) {
      res.status(403).end();
      return;
    }

    const targetPath = fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()
      ? absolutePath
      : path.join(resolvedStaticDir, "workshop.html");

    res.sendFile(targetPath);
  }

  // Health
  app.get("/api/relay/health", (_req, res) => {
    res.json({ ok: true, tunnels: upstream.tunnelCount });
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

    const userId = await verifyTunnelJwt(token);
    if (!userId) {
      const acceptsJson = (req.headers.accept || "").includes("application/json");
      if (acceptsJson) {
        return res.status(401).json({ error: "invalid_token" });
      }
      return res.redirect("/register.html");
    }

    // Check that JWT user matches the tunnel userId
    if (userId !== req.params.userId) {
      return res.status(403).json({ error: "forbidden" });
    }

    req.jwtUserId = userId;
    next();
  }

  // Proxy HTTP requests to user's tunnel. Static workshop shell/assets are served by Relay.
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

    // Upstream connection from local AgentTown (auth moved to ws.once("message"))
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

      // JWT auth for WS upgrade (token via query param since WS doesn't support custom headers)
      if (jwtSecret) {
        const token = url.searchParams.get("token");
        if (!token) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        const jwtUserId = await verifyTunnelJwt(token);
        if (!jwtUserId) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        if (jwtUserId !== userId) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
      }

      if (!upstream.isOnline(userId)) {
        socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
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
    console.log(`AgentTown Relay listening on http://${host}:${port}`);
  });

  return { server, upstream, proxy, status };
}

// Standalone runner
if (require.main === module) {
  const apiUrl = process.env.AGENTTOWN_API_URL || "http://127.0.0.1:9001";
  const jwtSecret = process.env.AGENTTOWN_JWT_SECRET || null;

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
      return data.userId || null;
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
