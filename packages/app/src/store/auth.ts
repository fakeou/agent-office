import { create } from "zustand";

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

const TOKEN_KEY = "agenttown_jwt";
const USER_ID_KEY = "agenttown_user_id";

export const useAuthStore = create<AuthState>((set) => ({
  token: window.localStorage.getItem(TOKEN_KEY),
  userId: window.localStorage.getItem(USER_ID_KEY),
  user: null,
  setAuth: ({ token, userId }) => {
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
