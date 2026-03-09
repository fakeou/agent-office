const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CODEX_SESSIONS_ROOT = path.join(os.homedir(), ".codex", "sessions");

function readJsonLinesHead(filePath, maxLines = 8) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(1048576);
    const length = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    const text = buffer.toString("utf8", 0, length);
    return text
      .split("\n")
      .filter(Boolean)
      .slice(0, maxLines)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readTranscriptTail(filePath, bytes = 1048576) {
  try {
    const stats = fs.statSync(filePath);
    const start = Math.max(0, stats.size - bytes);
    const length = stats.size - start;
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    fs.closeSync(fd);
    return buffer.toString("utf8");
  } catch {
    return "";
  }
}

function extractRecentEntries(filePath, count = 1000) {
  const text = readTranscriptTail(filePath);
  if (!text) {
    return [];
  }

  return text
    .split("\n")
    .filter(Boolean)
    .slice(-count)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function listSessionFiles(root = CODEX_SESSIONS_ROOT) {
  const files = [];

  function walk(dirPath) {
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const nextPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(nextPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }
      try {
        const stats = fs.statSync(nextPath);
        files.push({ path: nextPath, mtimeMs: stats.mtimeMs });
      } catch {
        // Ignore disappearing files from concurrent Codex writes.
      }
    }
  }

  walk(root);
  files.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return files;
}

function readSessionMeta(filePath) {
  const entries = readJsonLinesHead(filePath);
  const sessionMeta = entries.find((entry) => entry.type === "session_meta");
  return sessionMeta ? sessionMeta.payload || null : null;
}

function summarizeCodexSession(filePath) {
  const entries = extractRecentEntries(filePath);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const payload = entry.payload || {};

    if (entry.type === "event_msg") {
      if (payload.type === "task_started") {
        return {
          state: "working",
          lastLifecycle: "task_started",
          lastTimestamp: entry.timestamp || null,
          lastTurnId: payload.turn_id || null,
          lastAgentMessage: null
        };
      }

      if (payload.type === "task_complete") {
        return {
          state: "idle",
          lastLifecycle: "task_complete",
          lastTimestamp: entry.timestamp || null,
          lastTurnId: payload.turn_id || null,
          lastAgentMessage: payload.last_agent_message || null
        };
      }

      if (payload.type === "turn_aborted") {
        return {
          state: "idle",
          lastLifecycle: "turn_aborted",
          lastTimestamp: entry.timestamp || null,
          lastTurnId: payload.turn_id || null,
          lastAgentMessage: null
        };
      }
    }
  }

  return {
    state: null,
    lastLifecycle: null,
    lastTimestamp: null,
    lastTurnId: null,
    lastAgentMessage: null
  };
}

function findManagedCodexSessionFile(session, allSessions = []) {
  const linkedPath = session.meta && session.meta.codexSessionPath;
  if (linkedPath && fs.existsSync(linkedPath)) {
    return {
      path: linkedPath,
      sessionMeta: readSessionMeta(linkedPath)
    };
  }

  const assignedPaths = new Set(
    allSessions
      .filter((entry) => entry.sessionId !== session.sessionId)
      .map((entry) => entry.meta && entry.meta.codexSessionPath)
      .filter(Boolean)
  );

  const sessionStartMs = Date.parse((session.meta && session.meta.managedStartedAt) || session.createdAt || session.updatedAt || 0);
  const candidates = listSessionFiles()
    .filter((entry) => !assignedPaths.has(entry.path))
    .slice(0, 80)
    .map((entry) => ({
      ...entry,
      sessionMeta: readSessionMeta(entry.path)
    }))
    .filter((entry) => entry.sessionMeta && entry.sessionMeta.cwd === session.cwd)
    .map((entry) => {
      const metaTimestampMs = Date.parse(entry.sessionMeta.timestamp || 0);
      const effectiveTimeMs = Number.isFinite(metaTimestampMs) && metaTimestampMs > 0 ? metaTimestampMs : entry.mtimeMs;
      const deltaMs = Math.abs(effectiveTimeMs - sessionStartMs);
      const score =
        (entry.mtimeMs >= sessionStartMs - 15000 ? 60 : 0) +
        Math.max(0, 40 - Math.floor(deltaMs / 30000));
      return {
        ...entry,
        score,
        deltaMs,
        effectiveTimeMs
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.effectiveTimeMs - left.effectiveTimeMs);

  if (candidates.length === 0) {
    return null;
  }

  return {
    path: candidates[0].path,
    sessionMeta: candidates[0].sessionMeta
  };
}

module.exports = {
  CODEX_SESSIONS_ROOT,
  findManagedCodexSessionFile,
  summarizeCodexSession
};
