import { create } from "zustand";
import { api } from "../lib/api";
import { RELAY_BASE } from "../lib/config";
import {
  getEventsReconnectStateOnClose,
  getEventsReconnectStateOnOpen,
  INITIAL_EVENTS_RECONNECT_STATE,
} from "../lib/events-recovery";
import { shouldReplaceSocketOnResume } from "../lib/live-recovery";
import { getRelayWsQuery } from "../lib/relay-ws";
import { useAuthStore } from "./auth";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SessionState = "idle" | "working" | "approval" | "attention";
export type SessionStatus = "registered" | "running" | "completed" | "exited";

export interface Session {
  sessionId: string;
  provider: string;
  title: string;
  state: SessionState;
  displayState: string;
  displayZone: string;
  status: SessionStatus;
  visibleInOffice: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface SessionsState {
  sessions: Session[];
  connected: boolean;
  relayOnline: boolean;
  error: string | null;

  fetchSessions: () => Promise<void>;
  fetchRelayStatus: () => Promise<void>;
  upsertSession: (s: Session) => void;
  removeSession: (sessionId: string) => void;
  startWs: () => void;
  stopWs: () => void;
  reconnectNow: () => void;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectPromise: Promise<void> | null = null;
let reconnectState = INITIAL_EVENTS_RECONNECT_STATE;
const EVENTS_STALE_AFTER_MS = 1_500;
let lastMessageAt: number | null = null;
let firstMessageTimer: ReturnType<typeof setTimeout> | null = null;

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  connected: false,
  relayOnline: false,
  error: null,

  fetchSessions: async () => {
    const { userId } = useAuthStore.getState();
    if (!userId) { set({ error: "not_logged_in" }); return; }
    try {
      const data = await api<{ sessions: Session[] }>(
        `${RELAY_BASE}/tunnel/${userId}/api/sessions`
      );
      set({ sessions: data.sessions ?? [], error: null });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : "fetch_failed" });
      throw e;
    }
  },

  fetchRelayStatus: async () => {
    const { userId } = useAuthStore.getState();
    if (!userId) {
      set({ relayOnline: false, error: "not_logged_in" });
      return;
    }

    try {
      const data = await api<{ online?: boolean }>(
        `${RELAY_BASE}/api/users/${encodeURIComponent(userId)}/status`
      );
      set({ relayOnline: Boolean(data.online), error: null });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "relay_status_failed";
      if (message === "user_not_found" || message === "tunnel_offline") {
        set({ relayOnline: false });
        return;
      }
      set({ relayOnline: false, error: message });
      throw e;
    }
  },

  upsertSession: (s: Session) => {
    set((prev) => {
      const idx = prev.sessions.findIndex((x) => x.sessionId === s.sessionId);
      const next = [...prev.sessions];
      if (idx >= 0) next[idx] = s;
      else next.push(s);
      return { sessions: next };
    });
  },

  removeSession: (sessionId: string) => {
    set((prev) => ({ sessions: prev.sessions.filter((session) => session.sessionId !== sessionId) }));
  },

  startWs: () => {
    if (ws || connectPromise) return;

    const { token, userId } = useAuthStore.getState();
    if (!userId) return;

    connectPromise = (async () => {
      try {
        const wsBase = RELAY_BASE.replace(/^http/, "ws");
        const authQuery = await getRelayWsQuery(token);
        const url = authQuery
          ? `${wsBase}/tunnel/${userId}/ws/events?${authQuery}`
          : `${wsBase}/tunnel/${userId}/ws/events`;

        const socket = new WebSocket(url);
        ws = socket;

        socket.onopen = () => {
          set({ connected: true, error: null });
          void get().fetchRelayStatus().catch(() => {});
          reconnectState = getEventsReconnectStateOnOpen(reconnectState);
          if (firstMessageTimer) {
            clearTimeout(firstMessageTimer);
          }
          firstMessageTimer = setTimeout(() => {
            if (ws === socket && lastMessageAt == null) {
              socket.close();
            }
          }, EVENTS_STALE_AFTER_MS);
        };

        socket.onmessage = (ev) => {
          lastMessageAt = Date.now();
          if (firstMessageTimer) {
            clearTimeout(firstMessageTimer);
            firstMessageTimer = null;
          }
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "sessions:snapshot" && Array.isArray(msg.sessions)) {
              set({ sessions: msg.sessions });
            } else if (msg.type === "session:update" && msg.session) {
              if (msg.session.visibleInOffice === false || ["completed", "exited"].includes(msg.session.status)) {
                get().removeSession(msg.session.sessionId);
              } else {
                get().upsertSession(msg.session);
              }
            } else if (msg.type === "session:remove" && msg.sessionId) {
              get().removeSession(msg.sessionId);
            }
          } catch { /* ignore malformed */ }
        };

        socket.onclose = (ev) => {
          ws = null;
          set({ connected: false });
          if (firstMessageTimer) {
            clearTimeout(firstMessageTimer);
            firstMessageTimer = null;
          }

          if (ev.code === 4401 || ev.reason === "unauthorized" || ev.reason === "token_expired") {
            useAuthStore.getState().clearAuth();
            return;
          }

          reconnectState = getEventsReconnectStateOnClose(reconnectState, ev);
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            get().startWs();
          }, reconnectState.delayMs);
        };

        socket.onerror = () => {
          set({ error: "ws_error" });
        };
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "ws_auth_failed", connected: false });
      } finally {
        connectPromise = null;
      }
    })();
  },

  stopWs: () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    lastMessageAt = null;
    if (firstMessageTimer) {
      clearTimeout(firstMessageTimer);
      firstMessageTimer = null;
    }
    connectPromise = null;
    set({ connected: false, relayOnline: false });
  },

  reconnectNow: () => {
    // Kill pending reconnect timer and reset backoff
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectState = INITIAL_EVENTS_RECONNECT_STATE;

    if (
      ws &&
      !shouldReplaceSocketOnResume({
        readyState: ws.readyState,
        lastMessageAt,
        staleAfterMs: EVENTS_STALE_AFTER_MS,
      })
    ) {
      return;
    }

    if (ws) {
      ws.close();
      ws = null;
    }
    lastMessageAt = null;
    connectPromise = null;

    get().startWs();
  },
}));
