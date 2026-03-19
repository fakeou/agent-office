export function getOfficeStageClassName(hasOverlay: boolean) {
  return [
    "flex-1",
    "flex",
    "justify-center",
    "min-h-0",
    "overflow-hidden",
    hasOverlay ? "pointer-events-none select-none" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
