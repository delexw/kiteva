import type { ErrorCode } from "./errors";
export type PreparationStep = "inputs" | "brief" | "lyrics" | "styles" | "proposals" | "selection";
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
  "lyrics",
  "styles",
  "proposals",
  "selection",
];
export const preparationStepNames: Record<PreparationStep, string> = {
  inputs: "Reference material",
  brief: "Brief",
  lyrics: "Lyrics",
  styles: "Motion Graphic information",
  proposals: "Creative directions",
  selection: "Direction selection",
};
