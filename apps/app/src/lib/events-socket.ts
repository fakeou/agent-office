const TUNNEL_OFFLINE_CODE = 4502;
const TUNNEL_OFFLINE_REASON = "tunnel_offline";

export const RELAY_EVENTS_KEEPALIVE_INTERVAL_MS = 20_000;
export const EVENTS_FIRST_MESSAGE_TIMEOUT_MS =
  RELAY_EVENTS_KEEPALIVE_INTERVAL_MS + 5_000;

export function getEventsSocketOpenPatch() {
  return {
    connected: true,
    relayOnline: true,
    error: null as string | null,
  };
}

export function getEventsSocketClosePatch(close: {
  code?: number;
  reason?: string;
}) {
  if (
    close.code === TUNNEL_OFFLINE_CODE ||
    close.reason === TUNNEL_OFFLINE_REASON
  ) {
    return {
      connected: false,
      relayOnline: false,
    };
  }

  return {
    connected: false,
  };
}
