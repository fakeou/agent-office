const { EventEmitter } = require("node:events");
const os = require("node:os");
const crypto = require("node:crypto");
const { LOG_LIMIT } = require("../config");
const { displayZoneFor } = require("../state");
const { toPublicSession, toSessionSummary } = require("../session-contract");

function isoNow() {
  return new Date().toISOString();
}

function cloneSession(session) {
  return toPublicSession(session);
}

function applyState(session, nextState) {
  session.state = nextState;
  session.displayState = nextState;
  session.displayZone = displayZoneFor(nextState);
}

function createSessionStore() {
  const sessions = new Map();
  const emitter = new EventEmitter();

  function buildSession(payload) {
    const sessionId = payload.sessionId || `sess_${crypto.randomBytes(5).toString("hex")}`;
    const state = payload.state || "idle";
    const createdAt = payload.createdAt || isoNow();
    const updatedAt = payload.updatedAt || createdAt;

    return {
      sessionId,
      provider: payload.provider || "generic",
      title: payload.title || `${payload.provider || "worker"} session`,
      command: payload.command || "",
      cwd: payload.cwd || process.cwd(),
      mode: payload.mode || "managed",
      transport: payload.transport || "pty",
      state,
      displayState: payload.displayState || state,
      displayZone: payload.displayZone || displayZoneFor(state),
      status: payload.status || "registered",
      createdAt,
      updatedAt,
      lastOutputAt: payload.lastOutputAt || null,
      pid: payload.pid || null,
      host: payload.host || os.hostname(),
      meta: { ...(payload.meta || {}) },
      logs: [...(payload.logs || [])],
      events: [...(payload.events || [])]
    };
  }

  function emitUpdate(sessionId) {
    emitter.emit("session:update", getSession(sessionId));
  }

  function upsertSession(payload) {
    const sessionId = payload.sessionId || `sess_${crypto.randomBytes(5).toString("hex")}`;
    const existing = sessions.get(sessionId);

    if (!existing) {
      const created = buildSession({ ...payload, sessionId });
      sessions.set(sessionId, created);
      emitUpdate(sessionId);
      return created;
    }

    Object.assign(existing, {
      provider: payload.provider || existing.provider,
      title: payload.title || existing.title,
      command: payload.command || existing.command,
      cwd: payload.cwd || existing.cwd,
      mode: payload.mode || existing.mode,
      transport: payload.transport || existing.transport,
      pid: payload.pid === undefined ? existing.pid : payload.pid,
      host: payload.host || existing.host,
      meta: payload.meta ? { ...existing.meta, ...payload.meta } : existing.meta,
      updatedAt: payload.updatedAt || isoNow()
    });

    if (payload.lastOutputAt !== undefined) {
      existing.lastOutputAt = payload.lastOutputAt;
    }
    if (payload.state) {
      applyState(existing, payload.state);
    }
    if (payload.displayState && !payload.state) {
      existing.displayState = payload.displayState;
    }
    if (payload.displayZone && !payload.state) {
      existing.displayZone = payload.displayZone;
    }
    if (payload.status) {
      existing.status = payload.status;
    }

    emitUpdate(sessionId);
    return existing;
  }

  function setSessionState(sessionId, nextState, patch = {}) {
    const session = sessions.get(sessionId);
    if (!session) {
      return null;
    }

    applyState(session, nextState);
    session.updatedAt = isoNow();
    Object.assign(session, patch);
    if (patch.displayState) {
      session.displayState = patch.displayState;
    }
    if (patch.displayZone) {
      session.displayZone = patch.displayZone;
    }
    emitUpdate(sessionId);
    return session;
  }

  function addEvent(sessionId, eventName, patch = {}) {
    const session = sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.events.push({
      name: eventName,
      state: session.state,
      timestamp: isoNow(),
      meta: patch.meta || {}
    });
    session.events = session.events.slice(-80);
    session.updatedAt = isoNow();
    emitUpdate(sessionId);
    return session;
  }

  function appendOutput(sessionId, chunk) {
    const session = sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const lines = String(chunk).replace(/\r/g, "").split("\n").filter(Boolean);
    session.logs.push(...lines);
    session.logs = session.logs.slice(-LOG_LIMIT);
    session.lastOutputAt = isoNow();
    session.updatedAt = session.lastOutputAt;
    // Terminal output does not change session state — skip session:update broadcast.
    // Terminal data is forwarded directly by pty-manager via broadcastTerminal.
    return session;
  }

  function markExit(sessionId, patch = {}) {
    const session = sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.pid = null;
    session.updatedAt = isoNow();
    Object.assign(session, patch);
    if (patch.state) {
      applyState(session, patch.state);
    } else {
      if (patch.displayState) {
        session.displayState = patch.displayState;
      }
      if (patch.displayZone) {
        session.displayZone = patch.displayZone;
      }
    }
    emitUpdate(sessionId);
    return session;
  }

  function getSession(sessionId) {
    const session = sessions.get(sessionId);
    return session ? cloneSession(session) : null;
  }

  function getSessionSummary(sessionId) {
    const session = sessions.get(sessionId);
    return session ? toSessionSummary(session) : null;
  }

  function listSessions() {
    return [...sessions.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneSession);
  }

  function listSessionSummaries() {
    return [...sessions.values()]
      .filter((session) => !["completed", "exited"].includes(session.status))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((session) => toSessionSummary(session));
  }

  function removeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      return false;
    }
    sessions.delete(sessionId);
    emitter.emit("session:remove", {
      sessionId,
      session: cloneSession(session)
    });
    return true;
  }

  return {
    emitter,
    upsertSession,
    setSessionState,
    addEvent,
    appendOutput,
    markExit,
    getSession,
    getSessionSummary,
    listSessions,
    listSessionSummaries,
    removeSession
  };
}

module.exports = {
  createSessionStore
};
