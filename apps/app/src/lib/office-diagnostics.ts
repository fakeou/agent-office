export type OfficeDiagnosticsState = "ok" | "offline" | "checking" | "unknown";

export type OfficeDiagnosticsRow = {
  key: "browser-relay" | "relay-tunnel" | "events";
  label: string;
  state: OfficeDiagnosticsState;
  hint: string;
};

export function getOfficeDiagnosticsRows({
  connected,
  relayOnline,
  relayReachable,
}: {
  connected: boolean;
  relayOnline: boolean;
  relayReachable: boolean | null;
}): OfficeDiagnosticsRow[] {
  const browserRelayState: OfficeDiagnosticsState = connected
    ? "ok"
    : relayReachable === null
      ? "checking"
      : relayReachable
        ? "ok"
        : "offline";

  const relayTunnelState: OfficeDiagnosticsState = connected
    ? "ok"
    : relayReachable === null
      ? "unknown"
      : relayReachable === false
        ? "unknown"
        : relayOnline
          ? "ok"
          : "offline";

  const eventsState: OfficeDiagnosticsState = connected ? "ok" : "offline";

  return [
    {
      key: "browser-relay",
      label: "Browser -> Relay",
      state: browserRelayState,
      hint:
        browserRelayState === "offline"
          ? "The relay is unreachable from this browser right now."
          : browserRelayState === "checking"
            ? "Checking whether this browser can reach the relay..."
            : "Your browser can reach the hosted relay.",
    },
    {
      key: "relay-tunnel",
      label: "Relay -> Local Tunnel",
      state: relayTunnelState,
      hint:
        relayTunnelState === "offline"
          ? "Run ato start on your computer to reconnect the local tunnel."
          : relayTunnelState === "unknown"
            ? relayReachable === null
              ? "Tunnel status will appear after relay reachability is confirmed."
              : "Tunnel status is unavailable until the browser can reach the relay."
            : "Your connected computer is attached to the relay tunnel.",
    },
    {
      key: "events",
      label: "Events WebSocket",
      state: eventsState,
      hint:
        eventsState === "ok"
          ? "Live session events are streaming normally."
          : "Live events are disconnected. Tap Retry to reconnect.",
    },
  ];
}
