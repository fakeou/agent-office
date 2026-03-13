import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { IdleRoomCanvas, WorldHandle, WorkerState, WorkerInfo } from "../world/IdleRoomCanvas";
import { useSessionsStore } from "../store/sessions";

export function WorkshopPlaceholderPage() {
  const navigate = useNavigate();
  const [handle, setHandle] = useState<WorldHandle | null>(null);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sessions = useSessionsStore((s) => s.sessions);
  const connected = useSessionsStore((s) => s.connected);
  const fetchSessions = useSessionsStore((s) => s.fetchSessions);
  const startWs = useSessionsStore((s) => s.startWs);
  const stopWs = useSessionsStore((s) => s.stopWs);

  // connect to backend on mount
  useEffect(() => {
    fetchSessions().then(() => startWs()).catch(() => {/* backend unavailable */});
    return () => stopWs();
  }, [fetchSessions, startWs, stopWs]);

  const onReady = useCallback((h: WorldHandle) => {
    setHandle(h);
  }, []);

  // sync sessions → world
  useEffect(() => {
    if (!handle) return;
    const visible = (sessions ?? []).filter((s) => s.visibleInWorkshop);
    handle.syncSessions(visible.map((s) => ({
      sessionId: s.sessionId,
      title: s.title,
      state: s.state as WorkerState,
      visibleInWorkshop: s.visibleInWorkshop
    })));
    setWorkers(handle.getWorkers());
  }, [handle, sessions]);

  // poll worker state for UI pills
  useEffect(() => {
    if (!handle) return;
    pollRef.current = setInterval(() => setWorkers(handle.getWorkers()), 500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [handle]);

  function onWorkerClick(sessionId: string) {
    navigate(`/terminal/${sessionId}`);
  }

  return (
    <div className="page-shell workshop-shell workshop-page">
      <section className="workshop-layout">
        <header className="workshop-header">
          <div>
            <p className="eyebrow">Phase 3 MVP</p>
            <h1 className="page-title compact">Pixel Workshop</h1>
            <p className="page-copy">
              {connected
                ? "Connected to backend. Workers reflect real session states. Click a worker to open its terminal."
                : "Waiting for backend connection..."}
            </p>
          </div>
          <div className="topbar-actions">
            <span className={`status-pill ${connected ? "online" : "offline"}`}>
              {connected ? "Live" : "Offline"}
            </span>
            <Link className="ghost-link" to="/dashboard">Dashboard</Link>
          </div>
        </header>

        <div className="workshop-stage-grid">
          <section className="panel-card workshop-stage-card">
            <IdleRoomCanvas onReady={onReady} onWorkerClick={onWorkerClick} />
          </section>

          <aside className="panel-card workshop-notes">
            {/* per-worker cards */}
            {workers.map((w) => (
              <div key={w.id} className="placeholder-panel">
                <div className="worker-ctrl-header">
                  <strong>{w.name}</strong>
                  <span className={`worker-state-pill worker-state-pill--${w.targetState}`}>
                    {w.targetState}{w.state !== w.targetState && " ..."}
                  </span>
                </div>
              </div>
            ))}

            {workers.length === 0 && (
              <div className="placeholder-panel">
                <p className="page-copy">No active sessions. Start a session from the dashboard to see workers here.</p>
              </div>
            )}

            {/* info */}
            <div className="placeholder-panel">
              <strong>World layout</strong>
              <p>
                2×2 zones: <b>Idle</b> (top-left), <b>Working</b> (top-right),{" "}
                <b>Attention</b> (bottom-left), <b>Approval</b> (bottom-right).
                Click a worker to open its terminal.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
