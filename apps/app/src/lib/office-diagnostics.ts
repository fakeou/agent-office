export type OfficeDiagnosticsRow = {
  key: "events" | "relay-tunnel";
  label: string;
  ok: boolean;
  hint: string;
};

export function getOfficeDiagnosticsRows({
  connected,
  relayOnline,
}: {
  connected: boolean;
  relayOnline: boolean;
}): OfficeDiagnosticsRow[] {
  return [
    {
      key: "events",
      label: "Events WebSocket",
      ok: connected,
      hint: "WebSocket dropped. Tap Retry to reconnect.",
    },
    {
      key: "relay-tunnel",
      label: "Relay -> CLI Tunnel",
      ok: relayOnline,
      hint: "Run ato start on your computer to connect the tunnel.",
    },
  ];
}
