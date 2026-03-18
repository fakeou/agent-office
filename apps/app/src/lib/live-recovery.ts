const OPEN_SOCKET_STATE = 1;

export type MobilePlatform = "ios" | "android" | "web";

export interface ResumeSocketCheck {
  readyState: number;
  lastMessageAt: number | null;
  staleAfterMs: number;
  now?: number;
}

export function shouldReplaceSocketOnResume({
  readyState,
  lastMessageAt,
  staleAfterMs,
  now = Date.now(),
}: ResumeSocketCheck): boolean {
  if (readyState !== OPEN_SOCKET_STATE) {
    return true;
  }

  if (!lastMessageAt) {
    return true;
  }

  return now - lastMessageAt > staleAfterMs;
}

export function detectMobilePlatform(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): MobilePlatform {
  if (/iPad|iPhone|iPod/i.test(userAgent)) {
    return "ios";
  }

  if (/Android/i.test(userAgent)) {
    return "android";
  }

  return "web";
}

export function platformRecoveryMessage(platform: MobilePlatform): string {
  if (platform === "ios") {
    return "iOS backgrounds WebSockets aggressively. Expect fast foreground recovery, and use push notifications for real background alerts.";
  }

  if (platform === "android") {
    return "Android should recover quickly when you return to foreground, but background delivery still belongs to notifications, not a live socket.";
  }

  return "This app refreshes live worker state quickly when you return to the foreground.";
}
