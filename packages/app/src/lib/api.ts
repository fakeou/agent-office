import { API_BASE } from "./config";
import { useAuthStore } from "../store/auth";

type RequestOptions = RequestInit & {
  authenticated?: boolean;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, clearAuth } = useAuthStore.getState();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (options.authenticated !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path.startsWith("http") ? path : `${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    clearAuth();
    throw new Error("unauthorized");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : typeof payload?.error === "string"
          ? payload.error
          : "request_failed";
    throw new Error(message);
  }

  return payload as T;
}
