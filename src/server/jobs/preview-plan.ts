import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { ContentBrief, StyleCandidate } from "../../shared/contracts";

export const previewPlanArtifact = "PREVIEW_PLAN.json";

/** Persist the shared planning result, or a build's assigned direction from it. */
export async function writePreviewPlan(
  workspace: string,
  brief: ContentBrief,
  directions: StyleCandidate[],
) {
  const file = path.resolve(workspace, previewPlanArtifact);
  await mkdir(workspace, { recursive: true });
  await writeFile(file, JSON.stringify({ version: 1, brief, directions }, null, 2));
  return file;
}
