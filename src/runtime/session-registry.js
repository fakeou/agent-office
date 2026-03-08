const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REGISTRY_DIR = path.join(os.homedir(), ".agenttown", "sessions");

function ensureRegistryDir() {
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
}

function recordPath(sessionId) {
  return path.join(REGISTRY_DIR, `${sessionId}.json`);
}

function persistSessionRecord(session) {
  if (!session || session.transport !== "tmux" || !session.meta || !session.meta.tmuxSession) {
    return null;
  }
  ensureRegistryDir();
  const record = {
    sessionId: session.sessionId,
    provider: session.provider,
    title: session.title,
    command: session.command,
    cwd: session.cwd,
    mode: session.mode,
    transport: session.transport,
    state: session.state,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    host: session.host,
    meta: session.meta
  };
  const filePath = recordPath(session.sessionId);
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return filePath;
}

function removeSessionRecord(sessionId) {
  try {
    fs.unlinkSync(recordPath(sessionId));
    return true;
  } catch {
    return false;
  }
}

function listSessionRecords() {
  try {
    ensureRegistryDir();
  } catch {
    return [];
  }

  return fs.readdirSync(REGISTRY_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(REGISTRY_DIR, name))
    .map((filePath) => {
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

module.exports = {
  REGISTRY_DIR,
  listSessionRecords,
  persistSessionRecord,
  removeSessionRecord
};
