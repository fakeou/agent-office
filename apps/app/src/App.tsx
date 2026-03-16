import { ReactNode, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { RootRedirect } from "./routes/RootRedirect";
import { AuthPage } from "./routes/AuthPage";
import { DashboardPage } from "./routes/DashboardPage";
import { WorkshopPlaceholderPage } from "./routes/WorkshopPlaceholderPage";
import { TerminalPage } from "./routes/TerminalPage";
import { SessionsRuntime } from "./components/SessionsRuntime";
import { NavProvider } from "./components/NavSidebar";
import { useAuthStore } from "./store/auth";
import { hasValidJwt } from "./lib/jwt";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const authenticated = hasValidJwt(token);

  useEffect(() => {
    if (token && !authenticated) {
      clearAuth();
    }
  }, [authenticated, clearAuth, token]);

  return authenticated ? children : <Navigate to="/auth" replace />;
}

function AppRoutes() {
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const state = location.state as { backgroundLocation?: Location } | null;
  const backgroundLocation = state?.backgroundLocation;
  const authenticated = hasValidJwt(token);

  // Keep workshop always mounted so Godot iframe never reloads.
  const bgPath = (backgroundLocation as { pathname?: string } | null)?.pathname;
  const isWorkshopVisible = authenticated && (location.pathname === "/workshop" || bgPath === "/workshop");

  return (
    <>
      <SessionsRuntime />

      {/* Always mounted — display:none keeps the Godot iframe alive */}
      <div style={{ display: isWorkshopVisible ? undefined : "none" }}>
        <WorkshopPlaceholderPage />
      </div>

      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        {/* Workshop rendered above; keep route to prevent wildcard redirect */}
        <Route path="/workshop" element={<ProtectedRoute>{null}</ProtectedRoute>} />
        <Route path="/terminal/:sessionId" element={<ProtectedRoute><TerminalPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {backgroundLocation ? (
        <Routes>
          <Route path="/terminal/:sessionId" element={<ProtectedRoute><TerminalPage /></ProtectedRoute>} />
        </Routes>
      ) : null}
    </>
  );
}

export default function App() {
  return (
    <NavProvider>
      <AppRoutes />
    </NavProvider>
  );
}
