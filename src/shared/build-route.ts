/** Build routes describe execution, independently of creative preferences. */
export const buildRoutes = {
  "automatic-previews": { label: "Automatic styles with previews" },
  "selected-previews": { label: "Selected styles with previews" },
  "direct-build": { label: "Direct build" },
} as const;

export type BuildRoute = keyof typeof buildRoutes;

/** Requests are validated/normalized before execution; zero previews require selected styles. */
export function buildRouteOf(request: {
  candidateCount: number;
  selectedStyleIds?: readonly string[];
}): BuildRoute {
  if (!request.selectedStyleIds?.length) return "automatic-previews";
  return request.candidateCount === 0 ? "direct-build" : "selected-previews";
}

export function buildRouteLabel(request: Parameters<typeof buildRouteOf>[0]): string {
  return buildRoutes[buildRouteOf(request)].label;
}
