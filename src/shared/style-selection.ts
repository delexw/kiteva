import type { z } from "zod";

/** Normalize optional style selection without changing the requested preview count. */
export function normalizeStyleSelection<
  T extends { candidateCount: number; selectedStyleIds?: string[] },
>(request: T): T {
  const manual = Boolean(request.selectedStyleIds?.length);
  return {
    ...request,
    candidateCount: manual ? request.candidateCount : request.candidateCount || 5,
    selectedStyleIds: manual ? request.selectedStyleIds : undefined,
  };
}

export function videoStyleCountRange(duration: number) {
  if (duration < 30) return { min: 1, max: 3 };
  if (duration < 60) return { min: 1, max: 4 };
  if (duration < 180) return { min: 1, max: 5 };
  return { min: 2, max: 6 };
}
export const MAX_VIDEO_STYLE_COUNT = videoStyleCountRange(Number.POSITIVE_INFINITY).max;

export function manualStyleLimit(outputType: "video" | "page", duration: number | "auto" = "auto") {
  return outputType === "page" ? 3 : videoStyleCountRange(duration === "auto" ? 15 : duration).max;
}
export function trimStylesForDuration(
  ids: string[],
  outputType: "video" | "page",
  duration: number | "auto",
) {
  const limit = manualStyleLimit(outputType, duration);
  return ids.length > limit ? ids.slice(0, limit) : ids;
}
export function validateStyleSelection(
  request: {
    outputType: "video" | "page";
    preference?: string;
    pinnedStyleId?: string;
    duration?: number | "auto";
    candidateCount: number;
    selectedStyleIds?: string[];
  },
  context: z.RefinementCtx,
) {
  const ids = request.selectedStyleIds || [];
  if (request.preference === "random" && (ids.length || request.pinnedStyleId))
    context.addIssue({
      code: "custom",
      path: ["preference"],
      message:
        "Random selection uses the full pool. Clear selected or pinned Motion Graphics first.",
    });
  if (!ids.length && request.candidateCount === 0)
    context.addIssue({
      code: "custom",
      path: ["candidateCount"],
      message: "Select Motion Graphics for zero directions, or request 1–5 generated directions.",
    });
  if (
    new Set(ids).size !== ids.length ||
    ids.length > manualStyleLimit(request.outputType, request.duration)
  )
    context.addIssue({
      code: "custom",
      path: ["selectedStyleIds"],
      message: "Choose distinct Motion Graphics within the duration limit.",
    });
}
