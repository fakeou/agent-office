const crypto = require("node:crypto");

function createKeyService({ db }) {
  const insertKey = db.prepare(
    "INSERT INTO api_keys (id, user_id, key_hash, key_prefix, label) VALUES (?, ?, ?, ?, ?)"
  );
  const listByUser = db.prepare("SELECT id, key_prefix, label, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC");
  const findByHash = db.prepare("SELECT * FROM api_keys WHERE key_hash = ?");
  const findFirstByUser = db.prepare("SELECT id FROM api_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 1");
  const findOwnedKey = db.prepare("SELECT id, user_id FROM api_keys WHERE id = ? AND user_id = ?");
  const deleteKey = db.prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?");
  const touchLastUsed = db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?");

  function generateKeyId() {
    return `key_${crypto.randomBytes(6).toString("hex")}`;
  }

  function generateApiKey() {
    const secret = crypto.randomBytes(24).toString("hex");
    return `sk_${secret}`;
  }

  function hashKey(apiKey) {
    return crypto.createHash("sha256").update(apiKey).digest("hex");
  }

  function create({ userId, label = "" }) {
    const existing = findFirstByUser.get(userId);
    if (existing) {
      const error = new Error("key_exists");
      error.code = "KEY_EXISTS";
      throw error;
    }

    const keyId = generateKeyId();
    const rawKey = generateApiKey();
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 10);
    insertKey.run(keyId, userId, keyHash, keyPrefix, label);
    return { keyId, key: rawKey, keyPrefix };
  }

  function list(userId) {
    return listByUser.all(userId).map((row) => ({
      id: row.id,
      keyPrefix: row.key_prefix,
      label: row.label,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at
    }));
  }

  function remove({ keyId, userId }) {
    const key = findOwnedKey.get(keyId, userId);
    if (!key) {
      return null;
    }
    const result = deleteKey.run(keyId, userId);
    return result.changes > 0 ? { keyId: key.id, userId: key.user_id } : null;
  }

  function verify(apiKey) {
    if (!apiKey || !apiKey.startsWith("sk_")) {
      return null;
    }
    const keyHash = hashKey(apiKey);
    const row = findByHash.get(keyHash);
    if (!row) {
      return null;
    }
    touchLastUsed.run(row.id);
    return {
      userId: row.user_id,
      keyId: row.id
    };
  }

  return {
    create,
    list,
    remove,
    verify
  };
}

module.exports = {
  createKeyService
};
