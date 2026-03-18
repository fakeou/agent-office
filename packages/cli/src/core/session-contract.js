const { displayZoneFor } = require("./state");

const CONTRACT_VERSION = 1;

function sessionLifecycle(session) {
  const status = session.status || "registered";
  const displayState = session.displayState || session.state || "idle";
  const displayZone = session.displayZone || displayZoneFor(displayState);

  return {
    status,
    state: session.state || displayState,
    displayState,
    displayZone,
    visibleInOffice: !["completed", "exited"].includes(status)
  };
}

function toPublicSession(session) {
  if (!session) {
    return null;
  }

  const lifecycle = sessionLifecycle(session);
  const meta = { ...(session.meta || {}) };
  const runtime = {
    pid: session.pid || null,
    host: session.host || null,
    transport: session.transport,
    hasTerminal: ["pty", "tmux"].includes(session.transport),
    tmuxSession: meta.tmuxSession || null,
    attachCommand: meta.localAttachCommand || null
  };

  return {
    contractVersion: CONTRACT_VERSION,
    sessionId: session.sessionId,
    provider: session.provider,
    title: session.title,
    command: session.command,
    cwd: session.cwd,
    mode: session.mode,
    transport: session.transport,
    state: lifecycle.state,
    displayState: lifecycle.displayState,
    displayZone: lifecycle.displayZone,
    status: lifecycle.status,
    visibleInOffice: lifecycle.visibleInOffice,
    lifecycle,
    timestamps: {
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastOutputAt: session.lastOutputAt || null
    },
    runtime,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastOutputAt: session.lastOutputAt || null,
    pid: runtime.pid,
    host: runtime.host,
    meta,
    logs: [...(session.logs || [])],
    events: [...(session.events || [])]
  };
}

function toSessionSummary(session) {
  const publicSession = toPublicSession(session);
  if (!publicSession) {
    return null;
  }

  return {
    contractVersion: CONTRACT_VERSION,
    sessionId: publicSession.sessionId,
    provider: publicSession.provider,
    title: publicSession.title,
    mode: publicSession.mode,
    transport: publicSession.transport,
    state: publicSession.state,
    displayState: publicSession.displayState,
    displayZone: publicSession.displayZone,
    status: publicSession.status,
    visibleInOffice: publicSession.visibleInOffice,
    lifecycle: publicSession.lifecycle,
    timestamps: publicSession.timestamps,
    runtime: {
      host: publicSession.runtime.host,
      hasTerminal: publicSession.runtime.hasTerminal
    },
    createdAt: publicSession.createdAt,
    updatedAt: publicSession.updatedAt
  };
}

module.exports = {
  CONTRACT_VERSION,
  toPublicSession,
  toSessionSummary
};
