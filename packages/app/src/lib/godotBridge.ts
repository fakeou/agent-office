import type { Session } from "../store/sessions";

export const GODOT_BRIDGE_NAME = "agenttown-godot";

export interface GodotBridgeEnvelope<Payload = unknown> {
  bridge: typeof GODOT_BRIDGE_NAME;
  source: "app" | "godot";
  type: string;
  payload?: Payload;
  meta?: Record<string, unknown>;
  requestId?: string;
  timestamp?: number;
}

export interface GodotWorkerSnapshot {
  sessionId: string;
  title: string;
  provider: string;
  state: Session["state"];
  status: Session["status"];
  displayState: string;
  displayZone: string;
  visibleInWorkshop: boolean;
  updatedAt: string;
}

export interface GodotSessionsSyncPayload {
  connected: boolean;
  workerCount: number;
  sessions: GodotWorkerSnapshot[];
  generatedAt: string;
}

export function parseGodotBridgeMessage(input: unknown): GodotBridgeEnvelope | null {
  let parsed = input;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const message = parsed as Partial<GodotBridgeEnvelope>;
  if (message.bridge !== GODOT_BRIDGE_NAME || typeof message.type !== "string") {
    return null;
  }

  return {
    bridge: GODOT_BRIDGE_NAME,
    source: message.source === "godot" ? "godot" : "app",
    type: message.type,
    payload: message.payload,
    meta: typeof message.meta === "object" && message.meta ? message.meta : undefined,
    requestId: typeof message.requestId === "string" ? message.requestId : undefined,
    timestamp: typeof message.timestamp === "number" ? message.timestamp : undefined
  };
}

export function serializeGodotBridgeMessage<Payload>(
  message: Omit<GodotBridgeEnvelope<Payload>, "bridge" | "timestamp">,
): string {
  return JSON.stringify({
    bridge: GODOT_BRIDGE_NAME,
    timestamp: Date.now(),
    ...message
  });
}

export function resolveGodotTargetOrigin(url: string): string {
  if (!url) {
    return "*";
  }

  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return "*";
  }
}

export function mapSessionToGodotWorker(session: Session): GodotWorkerSnapshot {
  return {
    sessionId: session.sessionId,
    title: session.title,
    provider: session.provider,
    state: session.state,
    status: session.status,
    displayState: session.displayState,
    displayZone: session.displayZone,
    visibleInWorkshop: session.visibleInWorkshop,
    updatedAt: session.updatedAt
  };
}
