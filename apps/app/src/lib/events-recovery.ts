const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const TUNNEL_OFFLINE_CODE = 4502;
const TUNNEL_OFFLINE_REASON = "tunnel_offline";

export type EventsReconnectMode = "default" | "waiting_for_upstream";

export interface EventsReconnectState {
  delayMs: number;
  mode: EventsReconnectMode;
}

export interface EventsCloseLike {
  code?: number;
  reason?: string;
}

export const INITIAL_EVENTS_RECONNECT_STATE: EventsReconnectState = {
  delayMs: BASE_RECONNECT_DELAY_MS,
  mode: "default",
};

export function getEventsReconnectStateOnOpen(
  _state: EventsReconnectState,
): EventsReconnectState {
  return INITIAL_EVENTS_RECONNECT_STATE;
}

export function getEventsReconnectStateOnClose(
  state: EventsReconnectState,
  close: EventsCloseLike,
): EventsReconnectState {
  if (
    close.code === TUNNEL_OFFLINE_CODE ||
    close.reason === TUNNEL_OFFLINE_REASON ||
    state.mode === "waiting_for_upstream"
  ) {
    return {
      delayMs: BASE_RECONNECT_DELAY_MS,
      mode: "waiting_for_upstream",
    };
  }

  return {
    delayMs: Math.min(state.delayMs * 2, MAX_RECONNECT_DELAY_MS),
    mode: "default",
  };
}
