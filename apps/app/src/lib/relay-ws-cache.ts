export const CACHE_SAFE_MARGIN_MS = 30_000;   // treat token as expired 30 s early
export const PROACTIVE_REFRESH_MS = 60_000;   // schedule refresh 60 s before expiry

export interface TokenCache {
  query: string;
  expiresAt: number | null;
}

export function isCacheValid(cache: TokenCache | null, now = Date.now()): cache is TokenCache {
  if (!cache) return false;
  if (cache.expiresAt === null) return true; // no expiry info → treat as valid indefinitely
  return now < cache.expiresAt - CACHE_SAFE_MARGIN_MS;
}

export function proactiveRefreshDelay(expiresAt: number | null, now = Date.now()): number | null {
  if (expiresAt === null) return null;
  const delay = expiresAt - now - PROACTIVE_REFRESH_MS;
  return delay > 0 ? delay : null;
}
