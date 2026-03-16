import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Terminal } from "@xterm/xterm";
import { MenuButton } from "../components/NavSidebar";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { getRelayWsQuery } from "../lib/relay-ws";
import { useAuthStore } from "../store/auth";
import { useSessionsStore } from "../store/sessions";
import { RELAY_BASE } from "../lib/config";

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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnDelay = useRef(1000);
  const reconnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Terminal + WebSocket lifecycle
  useEffect(() => {
    if (!hostRef.current || !sessionId || !userId) return;
    disposed.current = false;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"IBM Plex Mono", monospace',
      theme: { background: "#151311", foreground: "#f7f0df" },
      allowProposedApi: true
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
      try {
        fit.fit();
        sendResize();
      } catch {
        // ignore during initial layout and teardown
      }
    }

    function scheduleFit() {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          fitTerminal();
        });
      });
    }

    // Unicode11: fix CJK wide character alignment
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    // Set up input handler before open — xterm buffers it
    const dataDisposable = term.onData((data) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Connect WebSocket early — incoming data buffers until term.open() is called
    async function connect() {
      if (disposed.current) return;
      const wsBase = RELAY_BASE.replace(/^http/, "ws");
      let authQuery = "";

      try {
        authQuery = await getRelayWsQuery(token);
      } catch {
        return;
      }

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
          if (msg.type === "terminal:data") term.write(msg.data);
          else if (msg.type === "terminal:unavailable") term.write(`\r\n[terminal unavailable: ${msg.reason}]\r\n`);
          else if (msg.type === "terminal:exit") term.write(`\r\n\r\n[process exited: ${msg.exitCode}]\r\n`);
        } catch { /* ignore */ }
      });

      ws.addEventListener("close", (ev) => {
        if (disposed.current) return;
        if (ev.code === 4401 || ev.reason === "unauthorized" || ev.reason === "token_expired") return;
        term.write("\r\n[connection lost, reconnecting…]\r\n");
        reconnTimer.current = setTimeout(() => {
          reconnDelay.current = Math.min(reconnDelay.current * 2, 30_000);
          void connect();
        }, reconnDelay.current);
      });
    }

    void connect();

    // Open terminal only once the container has real pixel dimensions.
    // If the container is still 0×0 (flex layout not yet painted), keep
    // retrying via rAF — this prevents xterm from initialising with a
    // zero-size canvas and appearing blank on first load.
    let ro: ResizeObserver | null = null;
    const handleWindowResize = () => scheduleFit();

    function tryOpen() {
      if (disposed.current || !hostRef.current) return;
      const { width, height } = hostRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        term.open(hostRef.current);

        // WebGL renderer: sharper text, better performance on high-DPI screens
        try {
          term.loadAddon(new WebglAddon());
        } catch {
          // WebGL not available, fall back to default canvas renderer
        }

        ro = new ResizeObserver(() => scheduleFit());
        ro.observe(hostRef.current);
        window.addEventListener("resize", handleWindowResize);
        scheduleFit();
      } else {
        rafRef.current = requestAnimationFrame(tryOpen);
      }
    }

    rafRef.current = requestAnimationFrame(tryOpen);

    return () => {
      disposed.current = true;
      ro?.disconnect();
      window.removeEventListener("resize", handleWindowResize);
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
    <div className={`terminal-shell ${hasBackgroundLocation ? "terminal-shell--overlay" : ""}`}>
      <header className="terminal-topbar">
        <div className="terminal-topbar-left">
          <MenuButton dark />
          <button
            className="ghost-link terminal-back-btn"
            type="button"
            onClick={() => (hasBackgroundLocation ? navigate(-1) : navigate("/workshop"))}
          >
            ←
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
