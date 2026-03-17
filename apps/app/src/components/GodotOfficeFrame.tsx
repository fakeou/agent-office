import { useEffect, useRef } from "react";
import { GODOT_OFFICE_URL } from "@/lib/config";
import {
  GodotSessionsSyncPayload,
  mapSessionToGodotWorker,
  parseGodotBridgeMessage,
  resolveGodotTargetOrigin,
  serializeGodotBridgeMessage,
} from "@/lib/godotBridge";
import type { Session } from "@/store/sessions";

interface GodotOfficeFrameProps {
  connected: boolean;
  sessions: Session[];
  onWorkerClick?: (sessionId: string) => void;
}

export function GodotOfficeFrame({ connected, sessions, onWorkerClick }: GodotOfficeFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const visibleSessions = sessions.filter((session) => session.visibleInOffice);
  const targetOrigin = resolveGodotTargetOrigin(GODOT_OFFICE_URL);
  const hasIframeSource = Boolean(GODOT_OFFICE_URL);

  function postToGodot(type: string, payload: unknown, meta?: Record<string, unknown>, requestId?: string) {
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow) return;
    targetWindow.postMessage(
      serializeGodotBridgeMessage({ source: "app", type, payload, meta, requestId }),
      targetOrigin,
    );
  }

  function syncSessionsToGodot() {
    const payload: GodotSessionsSyncPayload = {
      connected,
      workerCount: visibleSessions.length,
      sessions: visibleSessions.map(mapSessionToGodotWorker),
      generatedAt: new Date().toISOString(),
    };
    postToGodot("sync_sessions", payload);
  }

  useEffect(() => {
    if (!hasIframeSource) return undefined;

    function handleWindowMessage(event: MessageEvent) {
      if (!iframeRef.current?.contentWindow || event.source !== iframeRef.current.contentWindow) return;
      if (targetOrigin !== "*" && event.origin !== targetOrigin) return;

      const message = parseGodotBridgeMessage(event.data);
      if (!message || message.source !== "godot") return;

      if (message.type === "ready") {
        postToGodot("set_target_origin", { origin: window.location.origin }, { reason: "handshake" });
        syncSessionsToGodot();
        return;
      }
      if (message.type === "request_sessions") {
        syncSessionsToGodot();
        return;
      }
      if (message.type === "worker_click" || message.type === "open_terminal") {
        const sessionId =
          message.payload && typeof message.payload === "object" && "sessionId" in message.payload
            ? message.payload.sessionId
            : null;
        if (typeof sessionId === "string" && sessionId) onWorkerClick?.(sessionId);
      }
    }

    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
  }, [hasIframeSource, onWorkerClick, targetOrigin, connected, visibleSessions]);

  useEffect(() => {
    if (!hasIframeSource) return;
    syncSessionsToGodot();
  }, [hasIframeSource, connected, visibleSessions]);

  return (
    <div className="relative isolate z-0 w-full overflow-hidden bg-[#111]" style={{ aspectRatio: "9/10" }}>
      {!hasIframeSource ? (
        <div className="flex h-full items-center justify-center p-8 text-center">
          <div>
            <strong className="text-sm font-semibold text-foreground">Godot export URL is not configured.</strong>
            <p className="mt-1 text-xs text-muted-foreground">
              Set <code className="rounded bg-muted px-1 py-0.5">VITE_GODOT_OFFICE_URL</code> to the exported HTML entrypoint.
            </p>
          </div>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          className="absolute inset-0 h-full w-full border-0"
          src={GODOT_OFFICE_URL}
          title="AgentOffice Godot Office"
          allow="fullscreen"
        />
      )}
    </div>
  );
}
