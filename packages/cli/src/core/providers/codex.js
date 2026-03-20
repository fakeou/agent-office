const { displayZoneFor } = require("../state");
const { GenericProvider } = require("./generic");
const { findManagedCodexSessionFile, summarizeCodexSession } = require("./codex-transcript");

const APPROVAL_LINE_PATTERNS = [
  /^approval requested:/i,
  /^approval requested by /i,
  /^tool call needs your approval$/i,
  /^requires approval by policy$/i,
  /^requires approval:/i
];

const IDLE_LINE_PATTERNS = [
  /^conversation interrupted - tell the model what to do differently/i,
  /^something went wrong\? hit `?\/feedback`? to/i
];

const STATUS_LINE_CONTINUATION = String.raw`(?:$|[\s:.,;(])`;

const ATTENTION_LINE_PATTERNS = [
  new RegExp(`^stream disconnected before completion${STATUS_LINE_CONTINUATION}`, "i"),
  new RegExp(`^error sending request for url${STATUS_LINE_CONTINUATION}`, "i"),
  new RegExp(`^network error${STATUS_LINE_CONTINUATION}`, "i"),
  new RegExp(`^connection timeout${STATUS_LINE_CONTINUATION}`, "i"),
  new RegExp(`^timed out${STATUS_LINE_CONTINUATION}`, "i"),
  new RegExp(`^failed to send request${STATUS_LINE_CONTINUATION}`, "i"),
  new RegExp(`^failed to submit${STATUS_LINE_CONTINUATION}`, "i"),
  new RegExp(`^panic${STATUS_LINE_CONTINUATION}`, "i")
];

function matchesAnyLine(text, patterns) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => patterns.some((pattern) => pattern.test(line)));
}

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
    if (matchesAnyLine(chunk, IDLE_LINE_PATTERNS)) {
      return "idle";
    }

    if (matchesAnyLine(chunk, APPROVAL_LINE_PATTERNS)) {
      return "approval";
    }

    if (matchesAnyLine(chunk, ATTENTION_LINE_PATTERNS)) {
      return "attention";
    }

    return null;
  }

  getOverlayDisplayPatch(session, overlayState) {
    if (!overlayState) {
      if (session && session.displayState === "attention") {
        const nextDisplayState = session.state || "working";
        return {
          displayState: nextDisplayState,
          displayZone: displayZoneFor(nextDisplayState)
        };
      }
      return null;
    }

    if (session && overlayState === session.displayState) {
      return null;
    }

    return {
      displayState: overlayState,
      displayZone: displayZoneFor(overlayState)
    };
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
