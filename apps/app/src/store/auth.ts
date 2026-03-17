import { create } from "zustand";
import { hasValidJwt } from "../lib/jwt";

type User = {
  email: string;
  displayName?: string;
};

type AuthState = {
  token: string | null;
  userId: string | null;
  user: User | null;
  setAuth: (payload: { token: string; userId: string }) => void;
  setUser: (user: User | null) => void;
  clearAuth: () => void;
};

const TOKEN_KEY = "agentoffice_jwt";
const USER_ID_KEY = "agentoffice_user_id";

function readStoredAuth() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  const userId = window.localStorage.getItem(USER_ID_KEY);

  if (!hasValidJwt(token) || !userId) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_ID_KEY);
    return { token: null, userId: null };
  }

  return { token, userId };
}

const storedAuth = readStoredAuth();

export const useAuthStore = create<AuthState>((set) => ({
  token: storedAuth.token,
  userId: storedAuth.userId,
  user: null,
  setAuth: ({ token, userId }) => {
    if (!hasValidJwt(token) || !userId) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_ID_KEY);
      set({ token: null, userId: null, user: null });
      return;
    }
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_ID_KEY, userId);
    set({ token, userId });
  },
  setUser: (user) => set({ user }),
  clearAuth: () => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_ID_KEY);
    set({ token: null, userId: null, user: null });
  }
}));
