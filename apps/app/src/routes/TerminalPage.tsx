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
import { RELAY_BASE } from "@/lib/config";
import { shouldReplaceSocketOnResume } from "@/lib/live-recovery";
import { getRelayWsQuery } from "@/lib/relay-ws";
import {
  applyInputDataToBuffer,
  buildDraftSyncSequence,
} from "@/lib/terminal-input";
import {
  getTerminalSessionCache,
  patchTerminalSessionCache,
} from "@/lib/terminal-session-cache";
import { useAuthStore } from "@/store/auth";
import { useSessionsStore } from "@/store/sessions";

const isTouchDevice = typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);
const TERMINAL_STALE_AFTER_MS = 1500;

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

function captureTerminalPreview(term: Terminal) {
  const buffer = term.buffer.active;
  const viewportY = typeof buffer.viewportY === "number"
    ? buffer.viewportY
    : Math.max(0, buffer.baseY);
  const lines: string[] = [];

  for (let row = 0; row < term.rows; row += 1) {
    const line = buffer.getLine(viewportY + row);
    lines.push(line ? line.translateToString(true) : "");
  }

  return lines.join("\n").trimEnd();
}

function keyboardInsetFromViewport() {
  if (typeof window === "undefined" || !window.visualViewport) {
    return 0;
  }

  return Math.max(
    0,
    window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop,
  );
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
  const proxyInputRef = useRef<HTMLInputElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendInputRef = useRef<(data: string) => void>(() => {});
  const reconnDelay = useRef(1000);
  const reconnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastMessageAtRef = useRef<number | null>(null);
  const inputBufferRef = useRef("");
  const [termReady, setTermReady] = useState(false);
  const [cachedPreview, setCachedPreview] = useState("");
  const [proxyInputOpen, setProxyInputOpen] = useState(false);
  const [proxyDraft, setProxyDraft] = useState("");
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const cache = getTerminalSessionCache(sessionId);
    inputBufferRef.current = cache?.inputBuffer ?? "";
    setCachedPreview(cache?.previewText ?? "");
    setProxyDraft(cache?.inputBuffer ?? "");
    setProxyInputOpen(false);
    setKeyboardInset(0);
  }, [sessionId]);

  useEffect(() => {
    if (!proxyInputOpen) {
      setKeyboardInset(0);
      return;
    }

    const focusTimer = window.setTimeout(() => {
      proxyInputRef.current?.focus();
      proxyInputRef.current?.select();
    }, 30);

    const viewport = window.visualViewport;
    if (!viewport) {
      return () => {
        window.clearTimeout(focusTimer);
      };
    }

    const updateInset = () => {
      setKeyboardInset(keyboardInsetFromViewport());
    };

    updateInset();
    viewport.addEventListener("resize", updateInset);
    viewport.addEventListener("scroll", updateInset);

    return () => {
      window.clearTimeout(focusTimer);
      viewport.removeEventListener("resize", updateInset);
      viewport.removeEventListener("scroll", updateInset);
    };
  }, [proxyInputOpen]);

  function writeSessionCache(patch: { previewText?: string; inputBuffer?: string }) {
    if (!sessionId) {
      return;
    }
    const next = patchTerminalSessionCache(sessionId, patch);
    if (patch.previewText !== undefined) {
      setCachedPreview(next.previewText);
    }
  }

  function commitInputBuffer(nextBuffer: string) {
    inputBufferRef.current = nextBuffer;
    writeSessionCache({ inputBuffer: nextBuffer });
  }

  function openProxyInput() {
    if (!isTouchDevice || !termReady) {
      return;
    }

    setProxyDraft(inputBufferRef.current);
    setProxyInputOpen(true);
  }

  function syncProxyInput(submit: boolean) {
    const syncSequence = buildDraftSyncSequence(inputBufferRef.current, proxyDraft);
    if (syncSequence) {
      sendInputRef.current(syncSequence);
    } else {
      commitInputBuffer(proxyDraft);
    }
    if (submit) {
      sendInputRef.current("\r");
    }
    setProxyInputOpen(false);
  }

  useEffect(() => {
    if (!hostRef.current || !sessionId || !userId) return;
    disposed.current = false;
    setTermReady(false);
    lastMessageAtRef.current = null;
    const resolvedSessionId = sessionId;

    const wsTokenPromise = getRelayWsQuery(token).catch(() => "");
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"IBM Plex Mono", monospace',
      theme: { background: "#0a0a0a", foreground: "#f7f0df" },
      allowProposedApi: true,
      disableStdin: isTouchDevice,
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
      if (ws?.readyState !== WebSocket.OPEN) {
        return;
      }
      ws.send(JSON.stringify({ type: "input", data }));
      commitInputBuffer(applyInputDataToBuffer(inputBufferRef.current, data));
    });

    sendInputRef.current = (data: string) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }
      wsRef.current.send(JSON.stringify({ type: "input", data }));
      commitInputBuffer(applyInputDataToBuffer(inputBufferRef.current, data));
    };

    let gotFirstData = false;

    async function connect(freshToken?: boolean) {
      if (disposed.current) return;
      const wsBase = RELAY_BASE.replace(/^http/, "ws");
      let authQuery = "";
      try {
        authQuery = freshToken
          ? await getRelayWsQuery(token).catch(() => "")
          : await wsTokenPromise;
      } catch { return; }
      if (disposed.current) return;

      const url = authQuery
        ? `${wsBase}/tunnel/${userId}/ws/terminal/${encodeURIComponent(resolvedSessionId)}?${authQuery}`
        : `${wsBase}/tunnel/${userId}/ws/terminal/${encodeURIComponent(resolvedSessionId)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        reconnDelay.current = 1000;
        if (firstMessageTimer.current) clearTimeout(firstMessageTimer.current);
        firstMessageTimer.current = setTimeout(() => {
          if (wsRef.current === ws && !disposed.current && lastMessageAtRef.current == null) {
            ws.close();
          }
        }, TERMINAL_STALE_AFTER_MS);
        scheduleFit();
      });

      ws.addEventListener("message", (e) => {
        lastMessageAtRef.current = Date.now();
        if (firstMessageTimer.current) {
          clearTimeout(firstMessageTimer.current);
          firstMessageTimer.current = null;
        }
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
            commitInputBuffer("");
          }
        } catch { /* ignore */ }
      });

      ws.addEventListener("close", (ev) => {
        if (disposed.current) return;
        if (firstMessageTimer.current) {
          clearTimeout(firstMessageTimer.current);
          firstMessageTimer.current = null;
        }
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

    function tryOpen() {
      if (disposed.current || !hostRef.current) return;
      const { width, height } = hostRef.current.getBoundingClientRect();
      if (width <= 0 || height <= 0) {
        rafRef.current = requestAnimationFrame(tryOpen);
        return;
      }

      term.open(hostRef.current);
      if (!isTouchDevice) {
        try { term.loadAddon(new WebglAddon()); } catch { /* canvas fallback */ }
      }

      ro = new ResizeObserver(() => scheduleFit());
      ro.observe(hostRef.current);
      window.addEventListener("resize", handleWindowResize);
      scheduleFit();

      const fonts = document.fonts;
      if (fonts) {
        fonts.load('13px "IBM Plex Mono"').then(() => scheduleFit()).catch(() => {});
        fonts.ready.then(() => scheduleFit());
      }
    }

    rafRef.current = requestAnimationFrame(tryOpen);

    function handleResume() {
      if (disposed.current) return;
      const w = wsRef.current;
      if (
        w &&
        !shouldReplaceSocketOnResume({
          readyState: w.readyState,
          lastMessageAt: lastMessageAtRef.current,
          staleAfterMs: TERMINAL_STALE_AFTER_MS,
        })
      ) {
        return;
      }
      if (reconnTimer.current) { clearTimeout(reconnTimer.current); reconnTimer.current = null; }
      reconnDelay.current = 1000;
      lastMessageAtRef.current = null;
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
      const previewText = captureTerminalPreview(term);
      writeSessionCache({
        previewText,
        inputBuffer: inputBufferRef.current,
      });
      ro?.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      document.removeEventListener("visibilitychange", onVisibility);
      appListener.then((l) => l.remove());
      if (reconnTimer.current) clearTimeout(reconnTimer.current);
      if (firstMessageTimer.current) clearTimeout(firstMessageTimer.current);
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

      <div className="grid min-h-0 overflow-hidden lg:grid-cols-[1fr_200px]">
        <section className="relative flex min-h-0 flex-col overflow-hidden">
          {!termReady && cachedPreview && (
            <div className="absolute inset-0 z-0 overflow-hidden px-4 py-3">
              <pre className="m-0 h-full overflow-hidden whitespace-pre-wrap break-words font-mono text-[13px] leading-5 text-terminal-text/80">
                {cachedPreview}
              </pre>
            </div>
          )}
          {!termReady && (
            <TerminalLoading
              dimmed={Boolean(cachedPreview)}
              label={cachedPreview ? "Reconnecting..." : "Connecting..."}
            />
          )}
          <div
            className="h-0 flex-1 overflow-hidden p-1"
            ref={hostRef}
            onClick={openProxyInput}
          />
          {isTouchDevice && proxyInputOpen && (
            <div className="absolute inset-0 z-20" onClick={() => syncProxyInput(false)}>
              <div
                className="absolute inset-0 bg-black/30"
                aria-hidden="true"
              />
              <div
                className="absolute left-3 right-3 rounded-2xl border border-terminal-border bg-terminal-surface/95 p-3 shadow-2xl backdrop-blur"
                style={{ bottom: `${keyboardInset + 12}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                <p className="mb-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-terminal-muted">
                  Live Input Proxy
                </p>
                <input
                  ref={proxyInputRef}
                  value={proxyDraft}
                  onChange={(e) => setProxyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      syncProxyInput(true);
                    }
                  }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-xl border border-terminal-border bg-terminal-bg px-3 py-3 font-mono text-sm text-terminal-text outline-none placeholder:text-terminal-muted/60"
                  placeholder="Type here, tap outside to sync"
                />
                <p className="mt-2 text-[0.7rem] text-terminal-muted">
                  Tap outside to sync without running. Press return to sync and execute.
                </p>
              </div>
            </div>
          )}
          {isTouchDevice && termReady && !proxyInputOpen && (
            <MobileKeybar onKey={(data) => sendInputRef.current(data)} />
          )}
        </section>

        <aside className="hidden overflow-y-auto border-l border-terminal-border bg-terminal-surface p-3.5 lg:block">
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
