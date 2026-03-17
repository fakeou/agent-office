import { Loader2 } from "lucide-react";

export function TerminalLoading() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-terminal-bg">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-terminal-muted" />
        <span className="font-mono text-xs text-terminal-muted">Connecting...</span>
      </div>
    </div>
  );
}
