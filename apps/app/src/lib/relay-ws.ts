import { api } from "./api";
import { RELAY_BASE } from "./config";
import {
  isCacheValid,
  proactiveRefreshDelay,
  type TokenCache,
} from "./relay-ws-cache";

type RelayWsTokenResponse = {
  wsToken?: string;
  expiresAt?: string;
};

let tokenCache: TokenCache | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProactiveRefresh(token: string | null, expiresAt: number | null) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = proactiveRefreshDelay(expiresAt);
  if (!delay || !token) return;
  refreshTimer = setTimeout(() => {
    void getRelayWsQuery(token, /* force */ true).catch(() => {});
  }, delay);
}

export function clearRelayWsTokenCache() {
  tokenCache = null;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

export async function getRelayWsQuery(token: string | null, force = false): Promise<string> {
  if (!token) return "";

  if (!force && isCacheValid(tokenCache)) {
    return tokenCache.query;
  }

  try {
    const payload = await api<RelayWsTokenResponse>(`${RELAY_BASE}/api/ws-token`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    if (payload.wsToken) {
      const expiresAt = payload.expiresAt ? new Date(payload.expiresAt).getTime() : null;
      const query = `wsToken=${encodeURIComponent(payload.wsToken)}`;
      tokenCache = { query, expiresAt };
      scheduleProactiveRefresh(token, expiresAt);
      return query;
    }
  } catch (error) {
    if (
      error instanceof Error &&
      ["missing_token", "invalid_token", "token_expired", "token_revoked"].includes(error.message)
    ) {
      clearRelayWsTokenCache();
      throw error;
    }
  }

  // Fallback: long-lived token inline (no caching — no expiry info available)
  return `token=${encodeURIComponent(token)}`;
}
