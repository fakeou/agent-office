import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { RootRedirect } from "./routes/RootRedirect";
import { AuthPage } from "./routes/AuthPage";
import { DashboardPage } from "./routes/DashboardPage";
import { OfficePage } from "./routes/OfficePage";
import { TerminalPage } from "./routes/TerminalPage";
import { SessionsRuntime } from "./components/SessionsRuntime";
import { NavProvider } from "./components/layout/NavSheet";
import { SplashScreen } from "./components/splash/SplashScreen";
import { TooltipProvider } from "./components/ui/tooltip";
import {
  getOfficeBackExitOutcome,
  isAndroidUserAgent,
} from "./lib/android-back-exit";
import { useAuthStore } from "./store/auth";
import { hasValidJwt } from "./lib/jwt";

const OFFICE_BACK_EXIT_WINDOW_MS = 2000;

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
