import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { RootRedirect } from "./routes/RootRedirect";
import { AuthPage } from "./routes/AuthPage";
import { DashboardPage } from "./routes/DashboardPage";
import { OfficePage } from "./routes/OfficePage";
import { TerminalPage } from "./routes/TerminalPage";
import { SessionsRuntime } from "./components/SessionsRuntime";
import { MenuButton, NavProvider } from "./components/layout/NavSheet";
import { SplashScreen } from "./components/splash/SplashScreen";
import { Button } from "./components/ui/button";
import { TooltipProvider } from "./components/ui/tooltip";
import {
  getOfficeBackExitOutcome,
  isAndroidUserAgent,
} from "./lib/android-back-exit";
import { useAuthStore } from "./store/auth";
import { hasValidJwt } from "./lib/jwt";
import { getFloatingRouteNavLayerClass, getRouteNavMode } from "./lib/route-nav";

const OFFICE_BACK_EXIT_WINDOW_MS = 2000;

function FloatingRouteNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const mode = getRouteNavMode(location.pathname);
  const hasBackgroundLocation = Boolean(
    (location.state as { backgroundLocation?: unknown } | null)?.backgroundLocation
  );
  const isTerminalRoute = mode === "back";

  if (mode === "none") {
    return null;
  }

  return (
    <div
      className={`pointer-events-none fixed left-0 top-0 ${getFloatingRouteNavLayerClass(
        isTerminalRoute && hasBackgroundLocation,
      )}`}
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 12px)",
        paddingLeft: "calc(env(safe-area-inset-left) + 12px)",
      }}
    >
      <div className="pointer-events-auto">
        {mode === "menu" ? (
          <div className="rounded-xl border border-border/70 bg-white/90 shadow-lg backdrop-blur">
            <MenuButton />
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl border border-terminal-border bg-terminal-surface/90 text-terminal-text shadow-lg backdrop-blur hover:bg-terminal-surface"
            onClick={() => (hasBackgroundLocation ? navigate(-1) : navigate("/office"))}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function AndroidOfficeBackExit() {
  const location = useLocation();
  const armedUntilRef = useRef(0);
  const hideHintTimerRef = useRef<number | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const isAndroid = typeof navigator !== "undefined" && isAndroidUserAgent(navigator.userAgent);
  const isOfficeRoute = location.pathname === "/office";

  const clearHint = useCallback(() => {
    armedUntilRef.current = 0;
    setHintVisible(false);
    if (hideHintTimerRef.current) {
      window.clearTimeout(hideHintTimerRef.current);
      hideHintTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOfficeRoute) {
      clearHint();
    }
  }, [clearHint, isOfficeRoute]);

  useEffect(() => {
    if (!isAndroid) {
      return;
    }

    const listener = CapacitorApp.addListener("backButton", async ({ canGoBack }) => {
      if (!isOfficeRoute) {
        clearHint();
        if (canGoBack) {
          window.history.back();
          return;
        }
        await CapacitorApp.exitApp();
        return;
      }

      const outcome = getOfficeBackExitOutcome({
        now: Date.now(),
        armedUntil: armedUntilRef.current,
        windowMs: OFFICE_BACK_EXIT_WINDOW_MS,
      });

      armedUntilRef.current = outcome.armedUntil;

      if (outcome.shouldExit) {
        clearHint();
        await CapacitorApp.exitApp();
        return;
      }

      if (outcome.showHint) {
        setHintVisible(true);
        if (hideHintTimerRef.current) {
          window.clearTimeout(hideHintTimerRef.current);
        }
        hideHintTimerRef.current = window.setTimeout(() => {
          setHintVisible(false);
          hideHintTimerRef.current = null;
        }, OFFICE_BACK_EXIT_WINDOW_MS);
      }
    });

    return () => {
      listener.then((handle) => handle.remove());
      if (hideHintTimerRef.current) {
        window.clearTimeout(hideHintTimerRef.current);
        hideHintTimerRef.current = null;
      }
    };
  }, [clearHint, isAndroid, isOfficeRoute]);

  if (!isAndroid || !isOfficeRoute || !hintVisible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="rounded-full bg-black/85 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur">
        Back again to exit
      </div>
    </div>
  );
}

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

  // Keep office always mounted so Godot iframe never reloads.
  const bgPath = (backgroundLocation as { pathname?: string } | null)?.pathname;
  const isOfficeVisible = authenticated && (location.pathname === "/office" || bgPath === "/office");

  return (
    <>
      <SessionsRuntime />
      <FloatingRouteNav />
      <AndroidOfficeBackExit />

      {/* Always mounted — display:none keeps the Godot iframe alive */}
      <div style={{ display: isOfficeVisible ? undefined : "none" }}>
        <OfficePage />
      </div>

      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        {/* Office rendered above; keep route to prevent wildcard redirect */}
        <Route path="/office" element={<ProtectedRoute>{null}</ProtectedRoute>} />
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
  const isAndroid = typeof navigator !== "undefined" && isAndroidUserAgent(navigator.userAgent);
  const [splashDone, setSplashDone] = useState(!isAndroid);
  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  return (
    <TooltipProvider>
      <NavProvider>
        {!splashDone && <SplashScreen onComplete={handleSplashComplete} />}
        <AppRoutes />
      </NavProvider>
    </TooltipProvider>
  );
}
