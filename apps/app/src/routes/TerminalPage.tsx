import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { App } from "@capacitor/app";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { MenuButton } from "@/components/layout/NavSheet";
import { CopyButton } from "@/components/shared/CopyButton";
import { MobileKeybar } from "@/components/shared/MobileKeybar";
import { TerminalLoading } from "@/components/shared/TerminalLoading";
import { getRelayWsQuery } from "@/lib/relay-ws";
import { useAuthStore } from "@/store/auth";
import { useSessionsStore } from "@/store/sessions";
import { RELAY_BASE } from "@/lib/config";

const isTouchDevice = typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

function AttachCopyButton({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);
  const text = `ato attach ${sessionId}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-[0.7rem] font-mono text-terminal-muted hover:text-terminal-text hover:bg-white/5"
          onClick={() => void handleCopy()}
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          ato attach
        </Button>
      </TooltipTrigger>
      <TooltipContent>Copy attach command</TooltipContent>
    </Tooltip>
  );
}

function stateColor(state: string) {
  switch (state) {
    case "working": return "text-indigo-400";
    case "approval": return "text-orange-400";
    case "attention": return "text-red-400";
    default: return "text-terminal-muted";
  }
}

export function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  const sessions = useSessionsStore((s) => s.sessions);
  const session = sessions.find((s) => s.sessionId === sessionId);
  const hasBackgroundLocation = Boolean(
    (location.state as { backgroundLocation?: unknown } | null)?.backgroundLocation
  );

  const hostRef = useRef<HTMLDivElement | null>(null);
  const hiddenInputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendInputRef = useRef<(data: string) => void>(() => {});
  const reconnDelay = useRef(1000);
  const reconnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const rafRef = useRef<number | null>(null);
  const [termReady, setTermReady] = useState(false);

  useEffect(() => {
    if (!hostRef.current || !sessionId || !userId) return;
    disposed.current = false;
    setTermReady(false);

    // Start wsToken fetch immediately (parallel with font load + term setup)
    const wsTokenPromise = getRelayWsQuery(token).catch(() => "");

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"IBM Plex Mono", monospace',
      theme: { background: "#0a0a0a", foreground: "#f7f0df" },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    function sendResize() {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && term.cols > 0 && term.rows > 0) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    }

    function fitTerminal() {
      try { fit.fit(); sendResize(); } catch { /* ignore during layout */ }
    }

    function scheduleFit() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          fitTerminal();
        });
      });
    }

    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    const dataDisposable = term.onData((data) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Expose sendInput for MobileKeybar
    sendInputRef.current = (data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    };

    let gotFirstData = false;

    async function connect(freshToken?: boolean) {
      if (disposed.current) return;
      const wsBase = RELAY_BASE.replace(/^http/, "ws");
      // Reuse the pre-fetched wsToken, or fetch fresh on resume
      let authQuery = "";
      try {
        authQuery = freshToken
          ? await getRelayWsQuery(token).catch(() => "")
          : await wsTokenPromise;
      } catch { return; }
      if (disposed.current) return;

      const url = authQuery
        ? `${wsBase}/tunnel/${userId}/ws/terminal/${encodeURIComponent(sessionId!)}?${authQuery}`
        : `${wsBase}/tunnel/${userId}/ws/terminal/${encodeURIComponent(sessionId!)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        reconnDelay.current = 1000;
        scheduleFit();
      });

      ws.addEventListener("message", (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "terminal:data") {
            term.write(msg.data);
            if (!gotFirstData) {
              gotFirstData = true;
              setTermReady(true);
            }
          } else if (msg.type === "terminal:unavailable") {
            term.write(`\r\n[terminal unavailable: ${msg.reason}]\r\n`);
            setTermReady(true);
          } else if (msg.type === "terminal:exit") {
            term.write(`\r\n\r\n[process exited: ${msg.exitCode}]\r\n`);
            setTermReady(true);
          }
        } catch { /* ignore */ }
      });

      ws.addEventListener("close", (ev) => {
        if (disposed.current) return;
        if (ev.code === 4401 || ev.reason === "unauthorized" || ev.reason === "token_expired") return;
        term.write("\r\n[connection lost, reconnecting...]\r\n");
        reconnTimer.current = setTimeout(() => {
          reconnDelay.current = Math.min(reconnDelay.current * 2, 30_000);
          void connect();
        }, reconnDelay.current);
      });
    }

    void connect();

    let ro: ResizeObserver | null = null;
    const handleWindowResize = () => scheduleFit();

    async function tryOpen() {
      if (disposed.current || !hostRef.current) return;
      const { width, height } = hostRef.current.getBoundingClientRect();
      if (width <= 0 || height <= 0) {
        rafRef.current = requestAnimationFrame(tryOpen);
        return;
      }

      // Wait for IBM Plex Mono to load so character cell measurements are accurate
      await document.fonts.load('13px "IBM Plex Mono"').catch(() => {});

      if (disposed.current || !hostRef.current) return;

      term.open(hostRef.current);

      // Use canvas 2D on touch devices; WebGL on desktop
      if (!isTouchDevice) {
        try { term.loadAddon(new WebglAddon()); } catch { /* canvas fallback */ }
      }

      ro = new ResizeObserver(() => scheduleFit());
      ro.observe(hostRef.current);
      window.addEventListener("resize", handleWindowResize);
      scheduleFit();

      // Re-fit after all font weights finish loading
      document.fonts.ready.then(() => scheduleFit());
    }

    rafRef.current = requestAnimationFrame(tryOpen);

    // Reconnect terminal WS immediately when app resumes from background
    function handleResume() {
      if (disposed.current) return;
      const w = wsRef.current;
      if (w && w.readyState === WebSocket.OPEN) return; // still alive
      // Kill pending backoff timer and reconnect with fresh token
      if (reconnTimer.current) { clearTimeout(reconnTimer.current); reconnTimer.current = null; }
      reconnDelay.current = 1000;
      if (w) { w.close(); wsRef.current = null; }
      void connect(true);
    }

    const appListener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) handleResume();
    });
    function onVisibility() {
      if (document.visibilityState === "visible") handleResume();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed.current = true;
      sendInputRef.current = () => {};
      ro?.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      document.removeEventListener("visibilitychange", onVisibility);
      appListener.then((l) => l.remove());
      if (reconnTimer.current) clearTimeout(reconnTimer.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      dataDisposable.dispose();
      wsRef.current?.close();
      wsRef.current = null;
      term.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId, token]);

  return (
    <div
      className={`grid h-screen grid-rows-[auto_1fr] bg-terminal-bg text-terminal-text ${
        hasBackgroundLocation ? "fixed inset-0 z-50 safe-area-inset" : ""
      }`}
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-terminal-border bg-terminal-surface px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <MenuButton dark />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-terminal-muted hover:text-terminal-text hover:bg-white/5"
            onClick={() =>
              hasBackgroundLocation ? navigate(-1) : navigate("/office")
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[0.6rem] font-medium uppercase tracking-wider text-white/20">
              Terminal
            </span>
            <h2 className="truncate text-sm font-semibold">
              {session?.title ?? sessionId}
            </h2>
            {session && (
              <span className="hidden text-xs text-white/30 font-mono sm:inline">
                {session.provider} · {session.displayState}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sessionId && <AttachCopyButton sessionId={sessionId} />}
          {session && (
            <Badge
              variant="outline"
              className={`border-terminal-border text-[0.65rem] font-mono ${stateColor(session.state)}`}
            >
              {session.displayState}
            </Badge>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="grid min-h-0 overflow-hidden lg:grid-cols-[1fr_200px]">
        {/* Terminal */}
        <section className="relative flex min-h-0 flex-col overflow-hidden">
          {!termReady && <TerminalLoading />}
          <div
            className="h-0 flex-1 overflow-hidden p-1"
            ref={hostRef}
            onClick={() => isTouchDevice && hiddenInputRef.current?.focus()}
          />
          {isTouchDevice && (
            <>
              <textarea
                ref={hiddenInputRef}
                style={{ position: "absolute", opacity: 0, width: 1, height: 1, top: 0, left: 0, pointerEvents: "none" }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); sendInputRef.current("\r"); }
                  else if (e.key === "Backspace") { e.preventDefault(); sendInputRef.current("\x7f"); }
                }}
                onInput={(e) => {
                  const target = e.currentTarget;
                  const val = target.value;
                  if (val) { sendInputRef.current(val); target.value = ""; }
                }}
              />
              <MobileKeybar onKey={(data) => sendInputRef.current(data)} />
            </>
          )}
        </section>

        {/* Sidebar - PC only */}
        <aside className="hidden border-l border-terminal-border bg-terminal-surface p-3.5 overflow-y-auto lg:block">
          <div className="grid gap-3">
            <p className="text-[0.6rem] font-medium uppercase tracking-wider text-white/20">
              Session
            </p>
            {session ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1.5 text-[0.72rem]">
                <dt className="font-mono text-white/25">ID</dt>
                <dd className="break-all font-mono text-terminal-muted">{sessionId}</dd>
                <dt className="font-mono text-white/25">Provider</dt>
                <dd className="font-mono text-terminal-muted">{session.provider}</dd>
                <dt className="font-mono text-white/25">Status</dt>
                <dd className="font-mono text-terminal-muted">{session.status}</dd>
                <dt className="font-mono text-white/25">State</dt>
                <dd className={`font-mono ${stateColor(session.state)}`}>{session.displayState}</dd>
              </dl>
            ) : (
              <p className="break-all font-mono text-[0.8rem] text-white/30">
                {sessionId}
              </p>
            )}

            {/* Attach command block */}
            <div className="mt-1 rounded-md border border-terminal-border bg-terminal-bg p-3">
              <p className="mb-1.5 text-[0.6rem] uppercase tracking-wider text-white/20">
                Attach command
              </p>
              <code className="block break-all font-mono text-[0.75rem] text-green-400">
                ato attach {sessionId}
              </code>
              <CopyButton
                text={`ato attach ${sessionId}`}
                className="mt-2 w-full border-terminal-border text-terminal-muted hover:text-terminal-text hover:bg-white/5"
                variant="outline"
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
