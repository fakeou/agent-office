import { create } from "zustand";
import { api } from "../lib/api";
import { RELAY_BASE } from "../lib/config";
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
  visibleInWorkshop: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface SessionsState {
  sessions: Session[];
  connected: boolean;
  error: string | null;

  fetchSessions: () => Promise<void>;
  upsertSession: (s: Session) => void;
  startWs: () => void;
  stopWs: () => void;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_DELAY = 30_000;

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  connected: false,
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

  upsertSession: (s: Session) => {
    set((prev) => {
      const idx = prev.sessions.findIndex((x) => x.sessionId === s.sessionId);
      const next = [...prev.sessions];
      if (idx >= 0) next[idx] = s;
      else next.push(s);
      return { sessions: next };
    });
  },

  startWs: () => {
    if (ws) return;

    const { token, userId } = useAuthStore.getState();
    if (!userId) return;

    const wsBase = RELAY_BASE.replace(/^http/, "ws");
    const url = token
      ? `${wsBase}/tunnel/${userId}/ws/events?token=${encodeURIComponent(token)}`
      : `${wsBase}/tunnel/${userId}/ws/events`;

    const socket = new WebSocket(url);
    ws = socket;

    socket.onopen = () => {
      set({ connected: true, error: null });
      reconnectDelay = 1000;
    };

    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "sessions:snapshot" && Array.isArray(msg.sessions)) {
          set({ sessions: msg.sessions });
        } else if (msg.type === "session:update" && msg.session) {
          get().upsertSession(msg.session);
        }
      } catch { /* ignore malformed */ }
    };

    socket.onclose = (ev) => {
      ws = null;
      set({ connected: false });

      if (ev.code === 4401 || ev.reason === "unauthorized") {
        useAuthStore.getState().clearAuth();
        return;
      }

      // exponential backoff reconnect
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        get().startWs();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    };

    socket.onerror = () => {
      set({ error: "ws_error" });
    };
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
    set({ connected: false });
  }
}));
