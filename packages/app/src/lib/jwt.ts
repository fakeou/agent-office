function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return window.atob(padded);
}

function readJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }
  return JSON.parse(decodeBase64Url(payload)) as { exp?: number };
}

export function getJwtExpiryAt(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  try {
    const parsed = readJwtPayload(token);
    if (typeof parsed?.exp !== "number") {
      return null;
    }
    return parsed.exp * 1000;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string | null | undefined, now = Date.now()) {
  if (!token) {
    return true;
  }

  try {
    const parsed = readJwtPayload(token);
    if (!parsed || typeof parsed.exp !== "number") {
      return false;
    }
    return parsed.exp * 1000 <= now;
  } catch {
    return true;
  }
}

export function hasValidJwt(token: string | null | undefined, now = Date.now()) {
  return Boolean(token) && !isJwtExpired(token, now);
}
