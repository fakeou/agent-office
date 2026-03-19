export interface OfficeConnectionState {
  eventsConnected: boolean;
  relayOnline: boolean;
}

export function resolveOfficeConnected({
  eventsConnected,
  relayOnline,
}: OfficeConnectionState) {
  return eventsConnected && relayOnline;
}
