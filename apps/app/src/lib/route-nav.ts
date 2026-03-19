export type RouteNavMode = "menu" | "back" | "none";

export function getRouteNavMode(pathname: string): RouteNavMode {
  if (pathname === "/office" || pathname === "/dashboard") {
    return "menu";
  }

  if (pathname.startsWith("/terminal/")) {
    return "back";
  }

  return "none";
}

export function getFloatingRouteNavLayerClass(hasTerminalOverlay: boolean) {
  return hasTerminalOverlay ? "z-[60]" : "z-40";
}
