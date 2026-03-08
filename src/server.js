const http = require("node:http");
const path = require("node:path");
const express = require("express");
const { WebSocketServer } = require("ws");
const { STATIC_DIR } = require("./config");

function createAppServer({ host, port, store, ptyManager }) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(STATIC_DIR));

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
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    if (!pathname.startsWith("/ws/")) {
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
