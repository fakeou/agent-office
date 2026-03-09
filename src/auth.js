const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOKEN_DIR = path.join(os.homedir(), ".agenttown");
const TOKEN_PATH = path.join(TOKEN_DIR, "token");
const TOKEN_BYTES = 32;

let cachedToken = null;

function ensureTokenDir() {
  if (!fs.existsSync(TOKEN_DIR)) {
    fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  }
}

function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

function loadOrCreateToken() {
  ensureTokenDir();
  if (fs.existsSync(TOKEN_PATH)) {
    cachedToken = fs.readFileSync(TOKEN_PATH, "utf8").trim();
    if (cachedToken.length > 0) {
      return cachedToken;
    }
  }
  cachedToken = generateToken();
  fs.writeFileSync(TOKEN_PATH, cachedToken + "\n", { mode: 0o600 });
  return cachedToken;
}

function resetToken() {
  ensureTokenDir();
  cachedToken = generateToken();
  fs.writeFileSync(TOKEN_PATH, cachedToken + "\n", { mode: 0o600 });
  return cachedToken;
}

function setToken(token) {
  ensureTokenDir();
  cachedToken = token;
  fs.writeFileSync(TOKEN_PATH, cachedToken + "\n", { mode: 0o600 });
  return cachedToken;
}

function getToken() {
  if (!cachedToken) {
    loadOrCreateToken();
  }
  return cachedToken;
}

function verifyToken(input) {
  const expected = getToken();
  if (typeof input !== "string" || input.length === 0) {
    return false;
  }
  const inputBuf = Buffer.from(input);
  const expectedBuf = Buffer.from(expected);
  if (inputBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(inputBuf, expectedBuf);
}

const LAN_PATTERNS = [
  /^127\./,
  /^192\.168\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^::ffff:127\./,
  /^::ffff:192\.168\./,
  /^::ffff:10\./,
  /^::ffff:172\.(1[6-9]|2\d|3[01])\./
];

function isLanRequest(req) {
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || "";
  return LAN_PATTERNS.some((pattern) => pattern.test(ip));
}

function isLanIp(ip) {
  const addr = ip || "";
  return LAN_PATTERNS.some((pattern) => pattern.test(addr));
}

// --- Rate limiter ---

const loginAttempts = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

function getAttemptRecord(ip) {
  const now = Date.now();
  let record = loginAttempts.get(ip);
  if (!record) {
    record = { attempts: [], failures: 0, lockedUntil: 0 };
    loginAttempts.set(ip, record);
  }
  record.attempts = record.attempts.filter((t) => now - t < RATE_WINDOW_MS);
  return record;
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = getAttemptRecord(ip);
  if (record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, locked: true, remainingSeconds, remaining: 0 };
  }
  if (record.attempts.length >= MAX_ATTEMPTS_PER_WINDOW) {
    return { allowed: false, locked: false, remainingSeconds: 0, remaining: 0 };
  }
  return { allowed: true, locked: false, remainingSeconds: 0, remaining: MAX_ATTEMPTS_PER_WINDOW - record.attempts.length };
}

function recordAttempt(ip, success) {
  const now = Date.now();
  const record = getAttemptRecord(ip);
  record.attempts.push(now);
  if (success) {
    record.failures = 0;
    record.lockedUntil = 0;
  } else {
    record.failures += 1;
    if (record.failures >= LOCKOUT_THRESHOLD) {
      record.lockedUntil = now + LOCKOUT_DURATION_MS;
    }
  }
}

// --- Cookie helpers ---

const COOKIE_NAME = "agenttown_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((pair) => {
    const [name, ...rest] = pair.trim().split("=");
    if (name) {
      cookies[name.trim()] = decodeURIComponent(rest.join("=").trim());
    }
  });
  return cookies;
}

function getTokenFromCookie(req) {
  const header = req.headers?.cookie || "";
  const cookies = parseCookies(header);
  return cookies[COOKIE_NAME] || null;
}

function setAuthCookie(res, token, secure) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=${COOKIE_MAX_AGE}`
  ];
  if (secure) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearAuthCookie(res) {
  const parts = [
    `${COOKIE_NAME}=`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=0`
  ];
  res.setHeader("Set-Cookie", parts.join("; "));
}

module.exports = {
  TOKEN_PATH,
  loadOrCreateToken,
  resetToken,
  setToken,
  getToken,
  verifyToken,
  isLanRequest,
  isLanIp,
  checkRateLimit,
  recordAttempt,
  getTokenFromCookie,
  setAuthCookie,
  clearAuthCookie,
  parseCookies,
  COOKIE_NAME
};
