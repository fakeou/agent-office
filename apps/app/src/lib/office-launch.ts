import type { MobilePlatform } from "./live-recovery";

export function formatLaunchError(message: string) {
  if (message === "tunnel_offline" || message === "user_not_found") {
    return "Your connected computer is offline. Reconnect `ato start` and try again.";
  }

  if (message === "missing_command") {
    return "Agent command is missing. Pick Claude or Codex and try again.";
  }

  if (message === "request_failed") {
    return "Could not reach your connected computer. Check the hosted connection and try again.";
  }

  return message;
}

export function shouldShowOfficeHeaderText(platform: MobilePlatform) {
  return platform === "web";
}

export function getOfficeHeaderSafeAreaPaddingTop() {
  return "calc(env(safe-area-inset-top) + 16px)";
}

export function getParentDirectory(dirPath: string) {
  const normalized = dirPath.trim();
  if (!normalized) {
    return "";
  }

  if (normalized === "/") {
    return "/";
  }

  const trimmed = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  const index = trimmed.lastIndexOf("/");

  if (index < 0) {
    return "";
  }

  if (index === 0) {
    return "/";
  }

  return trimmed.slice(0, index);
}
