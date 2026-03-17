import { useEffect } from "react";
import { App } from "@capacitor/app";
import { getJwtExpiryAt, hasValidJwt } from "../lib/jwt";
import { useAuthStore } from "../store/auth";
import { useSessionsStore } from "../store/sessions";

export function SessionsRuntime() {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.userId);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const fetchSessions = useSessionsStore((state) => state.fetchSessions);
  const startWs = useSessionsStore((state) => state.startWs);
  const stopWs = useSessionsStore((state) => state.stopWs);
  const reconnectNow = useSessionsStore((state) => state.reconnectNow);
  const tokenValid = hasValidJwt(token);
  const tokenExpiryAt = getJwtExpiryAt(token);

  useEffect(() => {
    if (token && !tokenValid) {
      clearAuth();
      stopWs();
    }
  }, [clearAuth, stopWs, token, tokenValid]);

  useEffect(() => {
    if (!tokenValid || !userId) {
      stopWs();
      return;
    }

    fetchSessions().catch(() => {});
    startWs();

    return () => {
      stopWs();
    };
  }, [fetchSessions, startWs, stopWs, tokenValid, userId]);

  // Reconnect immediately when app returns to foreground
  useEffect(() => {
    if (!tokenValid || !userId) return;

    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        reconnectNow();
        fetchSessions().catch(() => {});
      }
    });

    // Also handle browser tab visibility (web / PWA)
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        reconnectNow();
        fetchSessions().catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      listener.then((l) => l.remove());
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchSessions, reconnectNow, tokenValid, userId]);

  useEffect(() => {
    if (!token || !tokenExpiryAt) {
      return;
    }

    const delay = tokenExpiryAt - Date.now();
    if (delay <= 0) {
      clearAuth();
      stopWs();
      return;
    }

    const timer = window.setTimeout(() => {
      clearAuth();
      stopWs();
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clearAuth, stopWs, token, tokenExpiryAt]);

  return null;
}
