try {
  process.loadEnvFile?.();
} catch {}

const crypto = require("node:crypto");
const express = require("express");
const { createDb, initDb } = require("./db");
const { createUserService } = require("./users");
const { createKeyService } = require("./keys");
const { createSocialService } = require("./social");
const { createEmailService } = require("./email");
const { createRateLimiter, rateLimitMiddleware } = require("./rate-limit");

async function createApiServer({ port = 9001, host = "0.0.0.0", dbPath, jwtSecret, relayUrl } = {}) {
  await initDb();
  const resolvedSecret = jwtSecret || process.env.AGENTTOWN_JWT_SECRET || crypto.randomBytes(32).toString("hex");
  const resolvedRelayUrl = relayUrl || process.env.AGENTTOWN_RELAY_URL || "http://127.0.0.1:9000";
  const internalSecret = process.env.AGENTTOWN_INTERNAL_SECRET || resolvedSecret || "";
  const db = createDb({ dbPath });
  const users = createUserService({ db, jwtSecret: resolvedSecret });
  const keys = createKeyService({ db });
  const social = createSocialService({ db });
  const emailService = createEmailService({ db });

  // --- Rate limiters ---
  const authLimiter = createRateLimiter();
  const keyVerifyLimiter = createRateLimiter({ maxAttempts: 10 });
  const sendCodeLimiter = createRateLimiter({ maxAttempts: 3, lockoutThreshold: 8, lockoutDurationMs: 30 * 60 * 1000 });

  const app = express();
  app.set("trust proxy", true);

  app.use((req, res, next) => {
    const origin = req.headers.origin || "";
    const allowLocalAppOrigin =
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      origin === "capacitor://localhost" ||
      origin === "https://localhost";

    if (!allowLocalAppOrigin) {
      return next();
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    next();
  });

  app.use(express.json({ limit: "1mb" }));

  async function readJsonPayload(req) {
    if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
      return req.body;
    }

    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) {
      return {};
    }

    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async function notifyRelayDisconnect(payload) {
    if (!resolvedRelayUrl) {
      return;
    }

    try {
      await fetch(`${resolvedRelayUrl}/api/internal/disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalSecret ? { "x-agenttown-internal-secret": internalSecret } : {})
        },
        body: JSON.stringify(payload)
      });
    } catch {
      // Best-effort only: auth revocation still lands in the API even if relay is unavailable.
    }
  }

  // Serve static web assets in dev mode
  try {
    const webPublicDir = require("node:path").join(__dirname, "../../web/public");
    app.use(express.static(webPublicDir));
  } catch {
    // web package not available — skip static file serving
  }

  // --- JWT auth middleware ---
  function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "missing_token" });
    }
    const verification = users.verifyJwtDetailed(token);
    if (!verification.userId) {
      return res.status(401).json({ error: verification.error || "invalid_token" });
    }
    req.userId = verification.userId;
    req.sessionId = verification.sessionId || null;
    next();
  }

  // --- Health ---
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // --- Public config ---
  app.get("/api/config/public", (_req, res) => {
    res.json({
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || ""
    });
  });

  // --- Auth endpoints ---

  app.post("/api/auth/send-code", rateLimitMiddleware(sendCodeLimiter), async (req, res) => {
    try {
      const { email, turnstileToken } = req.body;
      if (!email) {
        req.rateLimiter.record(false);
        return res.status(400).json({ error: "email is required" });
      }
      await emailService.sendCode({
        email,
        turnstileToken,
        remoteIp: req.ip
      });
      req.rateLimiter.record(true);
      res.json({ ok: true });
    } catch (err) {
      req.rateLimiter.record(false);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.post("/api/auth/register", rateLimitMiddleware(authLimiter), async (req, res) => {
    try {
      const { email, password, displayName, code } = req.body;
      emailService.verifyCode({ email, code });
      const result = await users.register({ email, password, displayName });
      req.rateLimiter.record(true);
      res.status(201).json(result);
    } catch (err) {
      req.rateLimiter.record(false);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.post("/api/auth/login", rateLimitMiddleware(authLimiter), async (req, res) => {
    try {
      const result = await users.login({
        email: req.body.email,
        password: req.body.password
      });
      req.rateLimiter.record(true);
      res.json(result);
    } catch (err) {
      req.rateLimiter.record(false);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = users.getUser(req.userId);
    if (!user) {
      return res.status(404).json({ error: "user_not_found" });
    }
    res.json(user);
  });

  // --- Token revocation ---

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    if (req.sessionId) {
      users.revokeSession(req.sessionId);
      await notifyRelayDisconnect({
        userId: req.userId,
        sessionId: req.sessionId,
        reason: "token_revoked"
      });
    } else {
      users.revokeAllTokens(req.userId);
      await notifyRelayDisconnect({ userId: req.userId, reason: "token_revoked" });
    }
    res.json({ ok: true });
  });

  app.post("/api/auth/revoke-all", requireAuth, (req, res) => {
    users.revokeAllTokens(req.userId);
    const sessionId = users.createSession(req.userId);
    const newToken = users.signTokenAfterRevocation(req.userId, sessionId);
    void notifyRelayDisconnect({ userId: req.userId, reason: "token_revoked" });
    res.json({ token: newToken });
  });

  // --- API Key management ---

  app.post("/api/keys", requireAuth, async (req, res, next) => {
    try {
      const payload = await readJsonPayload(req);
      const intent = typeof payload.intent === "string" ? payload.intent : "";

      if (intent === "delete") {
        const keyId = typeof payload.keyId === "string" ? payload.keyId : "";
        const deleted = keys.remove({ keyId, userId: req.userId });
        if (deleted) {
          void notifyRelayDisconnect({ userId: req.userId, keyId: deleted.keyId, reason: "key_revoked" });
        }
        return res.json({ ok: true });
      }

      const result = keys.create({
        userId: req.userId,
        label: typeof payload.label === "string" ? payload.label : ""
      });
      res.status(201).json(result);
    } catch (error) {
      if (error && error.code === "KEY_EXISTS") {
        return res.status(409).json({ error: "key_exists" });
      }
      next(error);
    }
  });

  app.get("/api/keys", requireAuth, (req, res) => {
    const userKeys = keys.list(req.userId);
    res.json({ keys: userKeys });
  });

  app.delete("/api/keys/:keyId", requireAuth, (req, res) => {
    const deleted = keys.remove({ keyId: req.params.keyId, userId: req.userId });
    if (deleted) {
      void notifyRelayDisconnect({ userId: req.userId, keyId: deleted.keyId, reason: "key_revoked" });
    }
    res.json({ ok: true });
  });

  // --- Social (Phase 4 stub) ---

  app.get("/api/users/:userId/workshop", (req, res) => {
    const visibility = social.getWorkshopVisibility(req.params.userId);
    if (visibility === "private") {
      return res.status(403).json({ error: "workshop_private" });
    }
    res.json({ userId: req.params.userId, visibility });
  });

  // --- Internal endpoints (used by Relay) ---

  app.post("/api/internal/verify-key", rateLimitMiddleware(keyVerifyLimiter), (req, res) => {
    const apiKey = req.body.key;
    const verification = keys.verify(apiKey);
    if (!verification?.userId) {
      req.rateLimiter.record(false);
      return res.status(401).json({ error: "invalid_key" });
    }
    req.rateLimiter.record(true);
    res.json({ userId: verification.userId, keyId: verification.keyId || null });
  });

  app.post("/api/internal/verify-jwt", rateLimitMiddleware(keyVerifyLimiter), (req, res) => {
    const token = req.body.token;
    if (!token) {
      return res.status(400).json({ error: "missing_token" });
    }
    const verification = users.verifyJwtDetailed(token);
    if (!verification.userId) {
      req.rateLimiter.record(false);
      return res.status(401).json({ error: verification.error || "invalid_token" });
    }
    req.rateLimiter.record(true);
    res.json({ userId: verification.userId, sessionId: verification.sessionId || null });
  });

  const server = app.listen(port, host, () => {
    console.log(`AgentTown API listening on http://${host}:${port}`);
  });

  return { server, app, users, keys, social, verifyKey: keys.verify };
}

// Standalone runner
if (require.main === module) {
  const port = Number(process.env.API_PORT || 9001);
  const host = process.env.API_HOST || "0.0.0.0";
  createApiServer({ port, host }).catch((err) => {
    console.error(`API server failed to start: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  createApiServer
};
