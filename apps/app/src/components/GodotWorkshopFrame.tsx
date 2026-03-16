import { useEffect, useRef } from "react";
import { GODOT_WORKSHOP_URL } from "../lib/config";
import {
  GodotSessionsSyncPayload,
  mapSessionToGodotWorker,
  parseGodotBridgeMessage,
  resolveGodotTargetOrigin,
  serializeGodotBridgeMessage
} from "../lib/godotBridge";
import type { Session } from "../store/sessions";

interface GodotWorkshopFrameProps {
  connected: boolean;
  sessions: Session[];
  onWorkerClick?: (sessionId: string) => void;
}

export function GodotWorkshopFrame({ connected, sessions, onWorkerClick }: GodotWorkshopFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const visibleSessions = sessions.filter((session) => session.visibleInWorkshop);
  const targetOrigin = resolveGodotTargetOrigin(GODOT_WORKSHOP_URL);
  const hasIframeSource = Boolean(GODOT_WORKSHOP_URL);

  function postToGodot(type: string, payload: unknown, meta?: Record<string, unknown>, requestId?: string) {
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow) {
      return;
    }

    targetWindow.postMessage(
      serializeGodotBridgeMessage({
        source: "app",
        type,
        payload,
        meta,
        requestId
      }),
      targetOrigin,
    );
  }

  function syncSessionsToGodot() {
    const payload: GodotSessionsSyncPayload = {
      connected,
      workerCount: visibleSessions.length,
      sessions: visibleSessions.map(mapSessionToGodotWorker),
      generatedAt: new Date().toISOString()
    };
    postToGodot("sync_sessions", payload);
  }

  useEffect(() => {
    if (!hasIframeSource) {
      return undefined;
    }

    function handleWindowMessage(event: MessageEvent) {
      if (!iframeRef.current?.contentWindow || event.source !== iframeRef.current.contentWindow) {
        return;
      }
      if (targetOrigin !== "*" && event.origin !== targetOrigin) {
        return;
      }

      const message = parseGodotBridgeMessage(event.data);
      if (!message || message.source !== "godot") {
        return;
      }

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

        if (typeof sessionId === "string" && sessionId) {
          onWorkerClick?.(sessionId);
        }
      }
    }

    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
  }, [hasIframeSource, onWorkerClick, targetOrigin, connected, visibleSessions]);

  useEffect(() => {
    if (!hasIframeSource) {
      return;
    }
    syncSessionsToGodot();
  }, [hasIframeSource, connected, visibleSessions]);

  return (
    <div className="godot-frame-shell">
      {!hasIframeSource ? (
        <div className="godot-frame-placeholder">
          <strong>Godot export URL is not configured.</strong>
          <p>Set `VITE_GODOT_WORKSHOP_URL` to the exported HTML entrypoint for the workshop iframe.</p>
        </div>
      ) : (
        <>
          <iframe
            ref={iframeRef}
            className="godot-frame"
            src={GODOT_WORKSHOP_URL}
            title="AgentTown Godot Workshop"
            allow="fullscreen"
          />
        </>
      )}
    </div>
  );
}
