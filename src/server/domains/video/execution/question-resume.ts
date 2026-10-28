import path from "node:path";
import { writeFile } from "node:fs/promises";
import { correctionMergeGuidance } from "../../../agents/correction-merge";
import { refinementDurationGuidance } from "../prompts";
import type { VideoExecutionInput } from "./types";

/** Apply an answered checkpoint to the existing composition without restarting planning. */
export async function executeQuestionResume(
  input: VideoExecutionInput & {
    decisions: string;
    emit: (type: string, message: string) => void;
    refinementDuration?: { min: number; max: number };
  },
) {
  const { job, fps } = input.planning;
  const { buildTurn, decisions, emit, refinementDuration } = input;
  emit("state", "Applying your decision…");
  const timing = refinementDuration
    ? refinementDurationGuidance(job.duration, refinementDuration)
    : `Keep the ${job.duration}s duration unchanged.`;
  const decisionPrompt = `The user answered a question about this existing ${job.kind === "preview" ? "preview" : "full video"}. Continue this session and apply only the decision below to the current composition. ${correctionMergeGuidance} Read request.instructions in style-context.json for the complete original idea and exact copy before reporting any information missing. Inspect any newly supplied files listed in style-context.json assetInputs before using them. Keep the selected Motion Graphics, dimensions, ${fps} fps and every unaffected scene unchanged. ${timing} Read STORYBOARD.json completely and return the updated production manifest and complete storyboard.\n\n${decisions}`;
  await writeFile(path.join(job.workspace, "EXECUTABLE_PROMPT.md"), decisionPrompt);
  await buildTurn(decisionPrompt);
}
