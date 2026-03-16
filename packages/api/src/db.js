const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const DEFAULT_DB_PATH = path.join(os.homedir(), ".agenttown", "api.db");

let initSqlJs;
try {
  initSqlJs = require("sql.js");
} catch {
  initSqlJs = null;
}

let BetterSqlite3;
try {
  BetterSqlite3 = require("better-sqlite3");
} catch {
  BetterSqlite3 = null;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    label TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
  CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

  CREATE TABLE IF NOT EXISTS verification_codes (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
`;

const MIGRATIONS = [
  "ALTER TABLE users ADD COLUMN token_revoked_before TEXT DEFAULT NULL",
  `CREATE TABLE IF NOT EXISTS verification_codes (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  "CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email)",
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)"
];

function runMigrations(db) {
  for (const sql of MIGRATIONS) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists or migration already applied — ignore
    }
  }
}

// --- better-sqlite3 backend (preferred, native) ---

function createBetterSqliteDb(resolvedPath) {
  const db = new BetterSqlite3(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  runMigrations(db);
  return db;
}

// --- sql.js backend (fallback, pure WASM) ---
// Wraps sql.js to expose a better-sqlite3-compatible synchronous API

function wrapSqlJs(sqlDb, resolvedPath) {
  function save() {
    const data = sqlDb.export();
    fs.writeFileSync(resolvedPath, Buffer.from(data));
  }

  function exec(sql) {
    sqlDb.run(sql);
    save();
  }

  function prepare(sql) {
    return {
      run(...params) {
        sqlDb.run(sql, params);
        save();
        const changes = sqlDb.getRowsModified();
        return { changes };
      },
      get(...params) {
        const stmt = sqlDb.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return undefined;
      },
      all(...params) {
        const results = [];
        const stmt = sqlDb.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      }
    };
  }

  function pragma(value) {
    try {
      sqlDb.run(`PRAGMA ${value}`);
    } catch {
      // Ignore pragma errors in sql.js
    }
  }

  return { exec, prepare, pragma };
}

function createSqlJsDbSync(resolvedPath) {
  // sql.js initSqlJs returns a Promise, but we need sync. Cache the init.
  if (!createSqlJsDbSync._SQL) {
    throw new Error("sql.js not initialized. Call createDb() after initDb().");
  }
  const SQL = createSqlJsDbSync._SQL;

  let sqlDb;
  if (fs.existsSync(resolvedPath)) {
    const buffer = fs.readFileSync(resolvedPath);
    sqlDb = new SQL.Database(buffer);
  } else {
    sqlDb = new SQL.Database();
  }

  const db = wrapSqlJs(sqlDb, resolvedPath);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  runMigrations(db);
  return db;
}

// --- Public API ---

let _initPromise = null;

async function initDb() {
  if (BetterSqlite3) {
    // Verify native module actually works
    try {
      new BetterSqlite3(":memory:").close();
      return; // Native module works, no async init needed
    } catch (err) {
      console.warn(`better-sqlite3 native module broken (${err.message}), falling back to sql.js`);
      BetterSqlite3 = null;
    }
  }
  if (!initSqlJs) {
    throw new Error("Neither better-sqlite3 nor sql.js is available");
  }
  if (!createSqlJsDbSync._SQL) {
    const SQL = await initSqlJs();
    createSqlJsDbSync._SQL = SQL;
  }
}

function createDb({ dbPath } = {}) {
  const resolvedPath = dbPath || process.env.AGENTTOWN_DB_PATH || DEFAULT_DB_PATH;
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  if (BetterSqlite3) {
    try {
      return createBetterSqliteDb(resolvedPath);
    } catch (err) {
      console.warn(`better-sqlite3 failed (${err.message}), falling back to sql.js`);
      BetterSqlite3 = null;
    }
  }
  return createSqlJsDbSync(resolvedPath);
}

module.exports = {
  createDb,
  initDb,
  DEFAULT_DB_PATH
};
