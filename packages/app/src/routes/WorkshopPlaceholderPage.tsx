import { useLocation, useNavigate } from "react-router-dom";
import { GodotWorkshopFrame } from "../components/GodotWorkshopFrame";
import { useSessionsStore } from "../store/sessions";
import { MenuButton } from "../components/NavSidebar";

export function WorkshopPlaceholderPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const sessions = useSessionsStore((s) => s.sessions);
  const connected = useSessionsStore((s) => s.connected);

  function onWorkerClick(sessionId: string) {
    if (location.pathname !== "/workshop") return;
    navigate(`/terminal/${sessionId}`, {
      state: { backgroundLocation: location }
    });
  }

  return (
    <div className="page-shell workshop-shell workshop-page">
      <section className="workshop-layout">
        <header className="workshop-header">
          <div className="topbar-left">
            <MenuButton />
            <div>
              <p className="eyebrow" style={{ marginBottom: 2 }}>AgentTown</p>
              <h1 className="page-title compact" style={{ margin: 0 }}>Workshop</h1>
            </div>
          </div>
          <span className={`status-pill ${connected ? "online" : "offline"}`}>
            {connected ? "Live" : "Offline"}
          </span>
        </header>

        <section className="panel-card workshop-stage-card">
          <GodotWorkshopFrame connected={connected} sessions={sessions} onWorkerClick={onWorkerClick} />
        </section>
      </section>
    </div>
  );
}
