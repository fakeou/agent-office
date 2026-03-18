import { Loader2 } from "lucide-react";

export function TerminalLoading({
  dimmed = false,
  label = "Connecting...",
}: {
  dimmed?: boolean;
  label?: string;
}) {
  return (
    <div
      className={`absolute inset-0 z-10 flex items-center justify-center ${
        dimmed ? "bg-terminal-bg/70 backdrop-blur-[2px]" : "bg-terminal-bg"
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-terminal-muted" />
        <span className="font-mono text-xs text-terminal-muted">{label}</span>
      </div>
    </div>
  );
}
