import type { ErrorCode } from "./errors";
export type PreparationStep =
  | "inputs"
  | "brief"
  | "subtitles"
  | "styles"
  | "proposals"
  | "selection"
  | "preview-plan";
export type PreparationCheckpoint =
  | { state: "running"; startedAt: string }
  | { state: "completed"; completedAt: string; output: unknown }
  | { state: "failed" | "interrupted"; finishedAt: string; errorCode: ErrorCode };
export interface PreparationState {
  fingerprint: string;
  checkpoints: Partial<Record<PreparationStep, PreparationCheckpoint>>;
}
export const preparationSteps: PreparationStep[] = [
  "inputs",
  "brief",
  "subtitles",
  "styles",
  "proposals",
  "selection",
  "preview-plan",
];
export const preparationStepNames: Record<PreparationStep, string> = {
  inputs: "Reference material",
  brief: "Brief",
  subtitles: "Subtitles",
  styles: "Motion Graphic information",
  proposals: "Creative directions",
  selection: "Direction selection",
  "preview-plan": "Preview planning",
};

export function usesTitleOnlyPreparation(
  request?: { selectedStyleIds?: readonly string[] },
  preparation?: PreparationState,
): boolean {
  const brief = preparation?.checkpoints.brief;
  const output = brief?.state === "completed" ? brief.output : undefined;
  if (output && typeof output === "object") {
    if ("variant" in output) return output.variant === "title-only";
    if ("assetReviewRevision" in output) return false;
  }
  return Boolean(request?.selectedStyleIds?.length);
}

export function preparationStepLabel(
  step: PreparationStep,
  request?: { selectedStyleIds?: readonly string[] },
  preparation?: PreparationState,
): string {
  if (usesTitleOnlyPreparation(request, preparation)) {
    if (step === "brief") return "Project title";
    if (step === "selection") return "Preview planning";
  }
  return preparationStepNames[step];
}
