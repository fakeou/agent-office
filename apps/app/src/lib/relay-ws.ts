import { api } from "./api";
import { RELAY_BASE } from "./config";

type RelayWsTokenResponse = {
  wsToken?: string;
  expiresAt?: string;
};

export async function getRelayWsQuery(token: string | null) {
  if (!token) {
    return "";
  }

  try {
    const payload = await api<RelayWsTokenResponse>(`${RELAY_BASE}/api/ws-token`, {
      method: "POST",
      body: JSON.stringify({})
    });

    if (payload.wsToken) {
      return `wsToken=${encodeURIComponent(payload.wsToken)}`;
    }
  } catch (error) {
    if (error instanceof Error && ["missing_token", "invalid_token", "token_expired", "token_revoked"].includes(error.message)) {
      throw error;
    }
  }

  return `token=${encodeURIComponent(token)}`;
}
