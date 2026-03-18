import { MOBILE_TERMINAL_KEYS } from "@/lib/terminal-input";

export function MobileKeybar({ onKey }: { onKey: (data: string) => void }) {
  return (
    <div className="flex gap-1 border-t border-terminal-border bg-terminal-surface px-2 py-1.5">
      {MOBILE_TERMINAL_KEYS.map(({ label, data, accent }) => (
        <button
          key={label}
          type="button"
          tabIndex={-1}
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
