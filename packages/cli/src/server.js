const http = require("node:http");
const path = require("node:path");
const express = require("express");
const { WebSocketServer } = require("ws");
const { STATIC_DIR } = require("@agent-office/web");
const auth = require("./auth");

function createAppServer({ host, port, store, ptyManager }) {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "1mb" }));

  const AUTH_WHITELIST = new Set([
    "/api/auth/login",
    "/api/auth/check",
    "/api/auth/logout",
    "/login.html",
    "/register.html",
    "/login.css"
  ]);

  function isWhitelisted(pathname) {
    if (AUTH_WHITELIST.has(pathname)) {
      return true;
    }
    return pathname.startsWith("/api/auth/");
  }

  function isAuthorizedRequest(req) {
    const ip = req.ip || req.socket?.remoteAddress || "";
    const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    if (isLocal) {
      return true;
    }
    const cookieToken = auth.getTokenFromCookie(req);
    return Boolean(cookieToken && auth.verifyToken(cookieToken));
  }

  function sendOfficeShell(res) {
    res.sendFile(path.join(STATIC_DIR, "office.html"));
  }

  app.use((req, res, next) => {
    if (isWhitelisted(req.path)) {
      return next();
    }

    if (isAuthorizedRequest(req)) {
      return next();
    }

    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "unauthorized" });
    }

    return res.redirect("/login.html");
  });

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
    return res.json({ ok: true });
  });

  app.post("/api/auth/logout", (_req, res) => {
    auth.clearAuthCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/check", (req, res) => {
    const cookieToken = auth.getTokenFromCookie(req);
    const authenticated = cookieToken ? auth.verifyToken(cookieToken) : false;
    res.json({ authenticated });
  });

  app.get("/", (_req, res) => {
    sendOfficeShell(res);
  });

  app.get("/index.html", (_req, res) => {
    sendOfficeShell(res);
  });

  app.use(express.static(STATIC_DIR, { index: false }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/sessions", (_req, res) => {
    res.json({ sessions: store.listSessionSummaries() });
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
    res.json({ ok: true, sessionId: session?.sessionId ?? null });
  });

  app.get("*", (_req, res) => {
    sendOfficeShell(res);
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (!pathname.startsWith("/ws/")) {
      socket.destroy();
      return;
    }

    const remoteIp = request.socket?.remoteAddress || "";
    const isLocal = remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp === "::ffff:127.0.0.1";
    if (!isLocal) {
      const cookieToken = auth.getTokenFromCookie(request);
      if (!cookieToken || !auth.verifyToken(cookieToken)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
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
    console.log(`AgentOffice listening on http://${host}:${port}`);
  });

  return server;
}

module.exports = {
  createAppServer
};
