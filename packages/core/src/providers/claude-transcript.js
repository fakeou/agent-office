const fs = require("node:fs");

const INTERRUPT_MARKERS = [
  "[Request interrupted by user]",
  "[Request interrupted by user for tool use]"
];

function readTranscriptTail(filePath, bytes = 65536) {
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

function extractRecentEntries(filePath) {
  const text = readTranscriptTail(filePath);
  if (!text) {
    return [];
  }
  return text
    .split("\n")
    .filter(Boolean)
    .slice(-30)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function isAfter(entry, sinceIso) {
  if (!sinceIso || !entry.timestamp) {
    return true;
  }
  return entry.timestamp > sinceIso;
}

function hasMarkerContent(content) {
  if (typeof content === "string") {
    return INTERRUPT_MARKERS.some((marker) => content.includes(marker));
  }
  if (Array.isArray(content)) {
    return content.some((item) => item && typeof item.text === "string" && INTERRUPT_MARKERS.includes(item.text));
  }
  return false;
}

function isInterruptEntry(entry) {
  return Boolean(entry && entry.type === "user" && entry.message && hasMarkerContent(entry.message.content));
}

function isRejectedToolUseEntry(entry) {
  if (!entry) {
    return false;
  }
  if (entry.toolUseResult === "User rejected tool use") {
    return true;
  }
  const content = entry.message && entry.message.content;
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some((item) => {
    if (!item || item.type !== "tool_result" || !item.is_error || typeof item.content !== "string") {
      return false;
    }
    return item.content.toLowerCase().includes("tool use was rejected");
  });
}

function hasInterruptMarker(filePath) {
  const entries = extractRecentEntries(filePath);
  const lastEntry = entries[entries.length - 1];
  return isInterruptEntry(lastEntry);
}

function detectPermissionResolution(filePath, sinceIso) {
  const entries = extractRecentEntries(filePath);
  const relevantEntries = sinceIso
    ? entries.filter((entry) => isAfter(entry, sinceIso))
    : entries.slice(-3);

  const rejectedEntry = [...relevantEntries].reverse().find((entry) => isRejectedToolUseEntry(entry));
  if (rejectedEntry) {
    return {
      eventName: "transcript_permission_denied",
      state: "idle",
      meta: {
        transcriptPath: filePath,
        timestamp: rejectedEntry.timestamp || null,
        reason: "Claude transcript recorded a denied tool-use approval without a follow-up hook state change."
      }
    };
  }

  const interruptEntry = [...relevantEntries].reverse().find((entry) => isInterruptEntry(entry));
  if (interruptEntry) {
    return {
      eventName: "transcript_interrupt",
      state: "idle",
      meta: {
        transcriptPath: filePath,
        timestamp: interruptEntry.timestamp || null,
        reason: "Claude transcript recorded a user interrupt without a follow-up hook state change."
      }
    };
  }

  return null;
}

module.exports = {
  detectPermissionResolution,
  hasInterruptMarker
};
