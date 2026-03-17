const KEYS: readonly { label: string; data: string; accent?: boolean }[] = [
  { label: "Ctrl+C", data: "\x03", accent: true },
  { label: "Ctrl+D", data: "\x04" },
  { label: "Esc",    data: "\x1B" },
  { label: "Tab",    data: "\t" },
  { label: "↵",      data: "\r" },
  { label: "↑",      data: "\x1B[A" },
  { label: "↓",      data: "\x1B[B" },
  { label: "←",      data: "\x1B[D" },
  { label: "→",      data: "\x1B[C" },
];

export function MobileKeybar({ onKey }: { onKey: (data: string) => void }) {
  return (
    <div className="flex gap-1 border-t border-terminal-border bg-terminal-surface px-2 py-1.5">
      {KEYS.map(({ label, data, accent }) => (
        <button
          key={label}
          onPointerDown={(e) => { e.preventDefault(); onKey(data); }}
          className={`flex-1 rounded py-2 font-mono text-xs
                      bg-white/5 active:bg-white/20
                      ${accent ? "text-red-400" : "text-terminal-muted"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
