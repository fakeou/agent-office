const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRY = "7d";

function createUserService({ db, jwtSecret }) {
  const insertUser = db.prepare(
    "INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)"
  );
  const findByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
  const findById = db.prepare("SELECT * FROM users WHERE id = ?");
  const getRevocationTimestamp = db.prepare(
    "SELECT token_revoked_before FROM users WHERE id = ?"
  );
  const setRevocationTimestamp = db.prepare(
    "UPDATE users SET token_revoked_before = datetime('now') WHERE id = ?"
  );
  const insertSession = db.prepare(
    "INSERT INTO auth_sessions (id, user_id) VALUES (?, ?)"
  );
  const findSessionById = db.prepare(
    "SELECT * FROM auth_sessions WHERE id = ?"
  );
  const revokeSessionById = db.prepare(
    "UPDATE auth_sessions SET revoked_at = datetime('now') WHERE id = ?"
  );
  const touchSession = db.prepare(
    "UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE id = ?"
  );

  function generateUserId() {
    return `user_${crypto.randomBytes(8).toString("hex")}`;
  }

  function generateSessionId() {
    return `sessauth_${crypto.randomBytes(8).toString("hex")}`;
  }

  function createSession(userId) {
    const sessionId = generateSessionId();
    insertSession.run(sessionId, userId);
    return sessionId;
  }

  async function register({ email, password, displayName }) {
    if (!email || !password) {
      throw Object.assign(new Error("email and password are required"), { status: 400 });
    }

    const existing = findByEmail.get(email.toLowerCase());
    if (existing) {
      throw Object.assign(new Error("email already registered"), { status: 409 });
    }

    const userId = generateUserId();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    insertUser.run(userId, email.toLowerCase(), passwordHash, displayName || null);

    const sessionId = createSession(userId);
    const token = signToken(userId, sessionId);
    return { userId, token };
  }

  async function login({ email, password }) {
    if (!email || !password) {
      throw Object.assign(new Error("email and password are required"), { status: 400 });
    }

    const user = findByEmail.get(email.toLowerCase());
    if (!user) {
      throw Object.assign(new Error("invalid credentials"), { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw Object.assign(new Error("invalid credentials"), { status: 401 });
    }

    const sessionId = createSession(user.id);
    const token = signToken(user.id, sessionId);
    return { userId: user.id, token };
  }

  function signToken(userId, sessionId = null) {
    const payload = { sub: userId };
    if (sessionId) {
      payload.sid = sessionId;
    }
    return jwt.sign(payload, jwtSecret, { expiresIn: JWT_EXPIRY });
  }

  // Sign a token guaranteed to survive a revocation done in the same second
  function signTokenAfterRevocation(userId, sessionId = null) {
    const iat = Math.floor(Date.now() / 1000) + 1;
    const payload = { sub: userId, iat };
    if (sessionId) {
      payload.sid = sessionId;
    }
    return jwt.sign(payload, jwtSecret, { expiresIn: JWT_EXPIRY });
  }

  function verifyJwtDetailed(token) {
    try {
      const payload = jwt.verify(token, jwtSecret);
      const userId = payload.sub;
      const sessionId = payload.sid || null;
      if (!userId) {
        return { userId: null, sessionId: null, error: "invalid_token" };
      }

      // Check revocation
      const row = getRevocationTimestamp.get(userId);
      if (row && row.token_revoked_before) {
        const revokedBefore = new Date(row.token_revoked_before + "Z").getTime() / 1000;
        if (payload.iat <= revokedBefore) {
          return { userId: null, sessionId: null, error: "token_revoked" };
        }
      }

      if (sessionId) {
        const session = findSessionById.get(sessionId);
        if (!session || session.user_id !== userId || session.revoked_at) {
          return { userId: null, sessionId: null, error: "token_revoked" };
        }
        try {
          touchSession.run(sessionId);
        } catch {
          // best-effort only
        }
      }

      return { userId, sessionId, error: null };
    } catch (error) {
      if (error && error.name === "TokenExpiredError") {
        return { userId: null, sessionId: null, error: "token_expired" };
      }
      return { userId: null, sessionId: null, error: "invalid_token" };
    }
  }

  function verifyJwt(token) {
    return verifyJwtDetailed(token).userId;
  }

  function revokeSession(sessionId) {
    if (!sessionId) {
      return false;
    }
    const result = revokeSessionById.run(sessionId);
    return result.changes > 0;
  }

  function revokeAllTokens(userId) {
    setRevocationTimestamp.run(userId);
  }

  function getUser(userId) {
    const user = findById.get(userId);
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at
    };
  }

  return {
    register,
    login,
    createSession,
    verifyJwt,
    verifyJwtDetailed,
    revokeSession,
    getUser,
    signToken,
    signTokenAfterRevocation,
    revokeAllTokens
  };
}

module.exports = {
  createUserService
};
