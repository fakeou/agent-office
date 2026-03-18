const { GenericProvider } = require("./generic");
const { findManagedCodexSessionFile, summarizeCodexSession } = require("./codex-transcript");

function activeOverlayPatch(session, nextLifecycleState) {
  if (!session || !["approval", "attention"].includes(session.displayState)) {
    return null;
  }

  if (nextLifecycleState === "idle") {
    return {
      displayState: "idle",
      displayZone: "idle-zone",
      meta: {
        overlayState: null,
        overlayUpdatedAt: null
      }
    };
  }

  return {
    displayState: session.displayState,
    displayZone: session.displayZone,
    meta: {
      overlayState: session.displayState,
      overlayUpdatedAt: session.updatedAt || null
    }
  };
}

class CodexProvider extends GenericProvider {
  constructor() {
    super("codex");
  }

  createSession(payload) {
    return {
      ...super.createSession(payload),
      meta: {
        managedStartedAt: new Date().toISOString(),
        codexSessionPath: null,
        codexSessionId: null,
        codexTranscriptCursor: null,
        codexLastLifecycle: null,
        ...(payload.meta || {})
      }
    };
  }

  classifyOutput(chunk) {
    const text = String(chunk).toLowerCase();
    if (text.includes("approval") || text.includes("press enter") || text.includes("confirm")) {
      return "approval";
    }
    if (
      text.includes("network error") ||
      text.includes("connection timeout") ||
      text.includes("timed out") ||
      text.includes("error") ||
      text.includes("failed") ||
      text.includes("panic")
    ) {
      return "attention";
    }
    return null;
  }

  reconcileSession(session, context = {}) {
    if (session.status === "exited") {
      return null;
    }

    const matched = findManagedCodexSessionFile(session, context.sessions || []);
    if (!matched || !matched.path) {
      return null;
    }

    const summary = summarizeCodexSession(matched.path);
    const nextMeta = {
      codexSessionPath: matched.path,
      codexSessionId: matched.sessionMeta && matched.sessionMeta.id,
      codexTranscriptCursor: summary.lastTimestamp || null,
      codexLastLifecycle: summary.lastLifecycle || null
    };

    const previousPath = session.meta && session.meta.codexSessionPath;
    const overlay = activeOverlayPatch(session, summary.state);
    const previousState = session.state;
    const previousCursor = session.meta && session.meta.codexTranscriptCursor;
    const previousLifecycle = session.meta && session.meta.codexLastLifecycle;
    const lifecycleAdvanced = Boolean(summary.lastTimestamp && summary.lastTimestamp !== previousCursor);
    const metaChanged =
      previousPath !== nextMeta.codexSessionPath ||
      (session.meta && session.meta.codexSessionId) !== nextMeta.codexSessionId ||
      previousCursor !== nextMeta.codexTranscriptCursor ||
      previousLifecycle !== nextMeta.codexLastLifecycle;
    const stateChanged = Boolean(summary.state && summary.state !== previousState);

    if (!metaChanged && !stateChanged && !lifecycleAdvanced) {
      return null;
    }

    return {
      session: metaChanged
        ? {
            meta: nextMeta
          }
        : null,
      state: summary.state,
      patch: summary.state
        ? {
            status: "running",
            ...(overlay
              ? {
                  displayState: overlay.displayState,
                  displayZone: overlay.displayZone
                }
              : {})
          }
        : null,
      eventName: lifecycleAdvanced && summary.lastLifecycle ? `codex_${summary.lastLifecycle}` : null,
      meta:
        lifecycleAdvanced || overlay
          ? {
              codexSessionPath: matched.path,
              codexSessionId: matched.sessionMeta && matched.sessionMeta.id,
              turnId: summary.lastTurnId || null,
              lastAgentMessage: summary.lastAgentMessage || null,
              ...(overlay ? overlay.meta : {})
            }
          : null
    };
  }
}

module.exports = {
  CodexProvider
};
