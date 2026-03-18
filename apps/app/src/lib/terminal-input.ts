export interface MobileTerminalKey {
  label: string;
  data: string;
  accent?: boolean;
}

export const MOBILE_TERMINAL_KEYS: readonly MobileTerminalKey[] = [
  { label: "Ctrl+C", data: "\x03", accent: true },
  { label: "Esc", data: "\x1B" },
  { label: "Tab", data: "\t" },
  { label: "↵", data: "\r" },
  { label: "↑", data: "\x1B[A" },
  { label: "↓", data: "\x1B[B" },
  { label: "←", data: "\x1B[D" },
  { label: "→", data: "\x1B[C" },
];

export function buildDraftSyncSequence(currentBuffer: string, nextDraft: string) {
  if (currentBuffer === nextDraft) {
    return "";
  }

  return "\x7f".repeat(Array.from(currentBuffer).length) + nextDraft;
}

export function applyInputDataToBuffer(currentBuffer: string, data: string) {
  let nextBuffer = currentBuffer;

  for (let index = 0; index < data.length; index += 1) {
    const char = data[index];

    if (char === "\x1B") {
      if (data[index + 1] === "[") {
        index += 2;
        while (index < data.length && !/[A-Za-z~]/.test(data[index])) {
          index += 1;
        }
      }
      continue;
    }

    switch (char) {
      case "\r":
      case "\x03":
        nextBuffer = "";
        break;
      case "\x7f":
        nextBuffer = Array.from(nextBuffer).slice(0, -1).join("");
        break;
      default:
        nextBuffer += char;
    }
  }

  return nextBuffer;
}
