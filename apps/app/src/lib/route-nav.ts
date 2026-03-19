export type RouteNavMode = "menu" | "none";

export function getRouteNavMode(pathname: string): RouteNavMode {
  if (pathname === "/office" || pathname === "/dashboard") {
    return "menu";
  }

  return "none";
}
