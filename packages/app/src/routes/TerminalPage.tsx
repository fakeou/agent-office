import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useAuthStore } from "../store/auth";
import { useSessionsStore } from "../store/sessions";
import { RELAY_BASE } from "../lib/config";

export function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  const sessions = useSessionsStore((s) => s.sessions);
  const fetchSessions = useSessionsStore((s) => s.fetchSessions);
  const startWs = useSessionsStore((s) => s.startWs);
  const stopWs = useSessionsStore((s) => s.stopWs);
  const session = sessions.find((s) => s.sessionId === sessionId);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnDelay = useRef(1000);
  const reconnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);

  // Keep sessions live while on this page
  useEffect(() => {
    fetchSessions().then(() => startWs()).catch(() => {});
    return () => stopWs();
  }, [fetchSessions, startWs, stopWs]);

  // Terminal + WebSocket lifecycle
  useEffect(() => {
    if (!hostRef.current || !sessionId || !userId) return;
    disposed.current = false;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"IBM Plex Mono", monospace',
      theme: { background: "#151311", foreground: "#f7f0df" }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);

    // FitAddon needs the container to have a rendered size — use ResizeObserver
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      } catch { /* ignore during teardown */ }
    });
    ro.observe(hostRef.current);

    window.addEventListener("resize", () => {
      try { fit.fit(); } catch { /* ignore */ }
    });

    function connect() {
      if (disposed.current) return;
      const wsBase = RELAY_BASE.replace(/^http/, "ws");
      const url = token
        ? `${wsBase}/tunnel/${userId}/ws/terminal/${encodeURIComponent(sessionId!)}?token=${encodeURIComponent(token)}`
        : `${wsBase}/tunnel/${userId}/ws/terminal/${encodeURIComponent(sessionId!)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        reconnDelay.current = 1000;
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      });

      ws.addEventListener("message", (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "terminal:data") term.write(msg.data);
          else if (msg.type === "terminal:unavailable") term.write(`\r\n[terminal unavailable: ${msg.reason}]\r\n`);
          else if (msg.type === "terminal:exit") term.write(`\r\n\r\n[process exited: ${msg.exitCode}]\r\n`);
        } catch { /* ignore */ }
      });

      ws.addEventListener("close", (ev) => {
        if (disposed.current) return;
        if (ev.code === 4401 || ev.reason === "unauthorized") return;
        term.write("\r\n[connection lost, reconnecting…]\r\n");
        reconnTimer.current = setTimeout(() => {
          reconnDelay.current = Math.min(reconnDelay.current * 2, 30_000);
          connect();
        }, reconnDelay.current);
      });

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });
    }

    connect();

    return () => {
      disposed.current = true;
      ro.disconnect();
      if (reconnTimer.current) clearTimeout(reconnTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      term.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId, token]);

  return (
    <div className="terminal-shell">
      <header className="terminal-topbar">
        <div className="terminal-topbar-left">
          <button className="ghost-link terminal-back-btn" type="button" onClick={() => navigate("/workshop")}>
            ← Workshop
          </button>
          <div className="terminal-meta-info">
            <p className="eyebrow" style={{ margin: 0 }}>Terminal</p>
            <h2 className="terminal-title">{session?.title ?? sessionId}</h2>
            {session && (
              <p className="terminal-summary">{session.provider} · {session.displayState}</p>
            )}
          </div>
        </div>
        {session && (
          <span className={`worker-state-pill worker-state-pill--${session.state}`} style={{ marginRight: 4 }}>
            {session.displayState}
          </span>
        )}
      </header>

      <div className="terminal-body">
        <section className="terminal-main">
          <div className="terminal-host" ref={hostRef} />
        </section>

        <aside className="terminal-sidebar">
          <div className="terminal-sidebar-section">
            <p className="eyebrow">Session</p>
            {session ? (
              <dl className="terminal-meta-grid">
                <dt>Provider</dt><dd>{session.provider}</dd>
                <dt>Status</dt><dd>{session.status}</dd>
                <dt>State</dt><dd>{session.displayState}</dd>
              </dl>
            ) : (
              <p className="muted-copy" style={{ margin: 0, fontSize: "0.85rem", color: "rgba(255,240,200,0.35)" }}>
                {sessionId}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
