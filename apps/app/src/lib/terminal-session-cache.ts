export interface TerminalSessionCacheEntry {
  previewText: string;
  inputBuffer: string;
}

const terminalSessionCache = new Map<string, TerminalSessionCacheEntry>();

export function getTerminalSessionCache(sessionId: string) {
  return terminalSessionCache.get(sessionId) || null;
}

export function patchTerminalSessionCache(
  sessionId: string,
  patch: Partial<TerminalSessionCacheEntry>,
) {
  const current = terminalSessionCache.get(sessionId) || {
    previewText: "",
    inputBuffer: "",
  };
  const next = { ...current, ...patch };
  terminalSessionCache.set(sessionId, next);
  return next;
}
