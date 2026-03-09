const http = require("node:http");
const path = require("node:path");
const express = require("express");
const { WebSocketServer } = require("ws");
const { STATIC_DIR } = require("@agenttown/web");
const auth = require("./auth");

function createAppServer({ host, port, store, ptyManager, forceAuth = false }) {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(STATIC_DIR));

  // --- Auth whitelist paths ---
  const AUTH_WHITELIST = [
    "/api/auth/login",
    "/api/auth/check",
    "/api/auth/logout",
    "/login.html",
    "/login.css",
    "/styles.css",
    "/app.js"
  ];

  function isWhitelisted(pathname) {
    return AUTH_WHITELIST.some((p) => pathname === p || pathname.startsWith("/api/auth/"));
  }

  // --- Auth middleware ---
  app.use((req, res, next) => {
    const pathname = req.path;

    if (isWhitelisted(pathname)) {
      return next();
    }

    if (!forceAuth && auth.isLanRequest(req)) {
      return next();
    }

    const cookieToken = auth.getTokenFromCookie(req);
    if (cookieToken && auth.verifyToken(cookieToken)) {
      return next();
    }

    if (pathname.startsWith("/api/")) {
      return res.status(401).json({ error: "unauthorized" });
    }

    return res.redirect("/login.html");
  });

  // --- Auth endpoints ---

  app.post("/api/auth/login", (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || "";
    const rateCheck = auth.checkRateLimit(ip);

    if (!rateCheck.allowed) {
      if (rateCheck.locked) {
        return res.status(429).json({
          error: "locked",
          message: `Too many failed attempts. Locked for ${rateCheck.remainingSeconds}s.`,
          remainingSeconds: rateCheck.remainingSeconds
        });
      }
      return res.status(429).json({
        error: "rate_limited",
        message: "Too many attempts. Try again in a minute.",
        remaining: 0
      });
    }

    const token = String(req.body.token || "").trim();
    if (!auth.verifyToken(token)) {
      auth.recordAttempt(ip, false);
      const afterCheck = auth.checkRateLimit(ip);
      return res.status(401).json({
        error: "invalid_token",
        remaining: afterCheck.remaining
      });
    }

    auth.recordAttempt(ip, true);
    const secure = req.protocol === "https" || req.get("x-forwarded-proto") === "https";
    auth.setAuthCookie(res, token, secure);
    res.json({ ok: true });
  });

  app.post("/api/auth/logout", (_req, res) => {
    auth.clearAuthCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/check", (req, res) => {
    const cookieToken = auth.getTokenFromCookie(req);
    const authenticated = cookieToken ? auth.verifyToken(cookieToken) : false;
    const lan = auth.isLanRequest(req);
    res.json({ authenticated: authenticated || (!forceAuth && lan), lan, forceAuth });
  });

  // --- Existing API routes ---

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/sessions", (_req, res) => {
    res.json({ sessions: store.listSessions() });
  });

  app.get("/api/sessions/:sessionId", (req, res) => {
    const session = store.getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }
    res.json(session);
  });

  app.post("/api/sessions/launch", (req, res) => {
    const command = String(req.body.command || "").trim();
    if (!command) {
      res.status(400).json({ error: "missing_command" });
      return;
    }
    const session = ptyManager.createManagedSession({
      provider: req.body.provider || "generic",
      title: req.body.title || command,
      cwd: req.body.cwd || process.cwd(),
      command,
      transport: req.body.transport || null
    });
    res.json({ session });
  });

  app.post("/api/providers/claude/hook", (req, res) => {
    const session = ptyManager.ingestClaudeHook(req.body || {});
    res.json({ ok: true, sessionId: session.sessionId });
  });

  app.get("*", (req, res) => {
    if (!forceAuth && auth.isLanRequest(req)) {
      return res.sendFile(path.join(STATIC_DIR, "index.html"));
    }
    const cookieToken = auth.getTokenFromCookie(req);
    if (cookieToken && auth.verifyToken(cookieToken)) {
      return res.sendFile(path.join(STATIC_DIR, "index.html"));
    }
    return res.redirect("/login.html");
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // --- WebSocket upgrade with auth ---
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (!pathname.startsWith("/ws/")) {
      socket.destroy();
      return;
    }

    const ip = request.socket?.remoteAddress || "";
    const isLan = auth.isLanIp(ip);

    if (!forceAuth && isLan) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.path = pathname;
        wss.emit("connection", ws, request);
      });
      return;
    }

    const cookieToken = auth.getTokenFromCookie(request);
    if (!cookieToken || !auth.verifyToken(cookieToken)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.path = pathname;
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    if (ws.path === "/ws/events") {
      ptyManager.registerEventsSocket(ws);
      return;
    }
    if (ws.path.startsWith("/ws/terminal/")) {
      const sessionId = decodeURIComponent(ws.path.split("/").pop());
      ptyManager.registerTerminalSocket(sessionId, ws);
      return;
    }
    ws.close();
  });

  server.listen(port, host, () => {
    console.log(`AgentTown listening on http://${host}:${port}`);
  });

  return server;
}

module.exports = {
  createAppServer
};
