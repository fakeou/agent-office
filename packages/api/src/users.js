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

  function generateUserId() {
    return `user_${crypto.randomBytes(8).toString("hex")}`;
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

    const token = signToken(userId);
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

    const token = signToken(user.id);
    return { userId: user.id, token };
  }

  function signToken(userId) {
    return jwt.sign({ sub: userId }, jwtSecret, { expiresIn: JWT_EXPIRY });
  }

  // Sign a token guaranteed to survive a revocation done in the same second
  function signTokenAfterRevocation(userId) {
    const iat = Math.floor(Date.now() / 1000) + 1;
    return jwt.sign({ sub: userId, iat }, jwtSecret, { expiresIn: JWT_EXPIRY });
  }

  function verifyJwt(token) {
    try {
      const payload = jwt.verify(token, jwtSecret);
      const userId = payload.sub;
      if (!userId) return null;

      // Check revocation
      const row = getRevocationTimestamp.get(userId);
      if (row && row.token_revoked_before) {
        const revokedBefore = new Date(row.token_revoked_before + "Z").getTime() / 1000;
        if (payload.iat <= revokedBefore) {
          return null;
        }
      }

      return userId;
    } catch {
      return null;
    }
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
    verifyJwt,
    getUser,
    signToken,
    signTokenAfterRevocation,
    revokeAllTokens
  };
}

module.exports = {
  createUserService
};
