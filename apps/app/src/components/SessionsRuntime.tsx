import { useEffect } from "react";
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
