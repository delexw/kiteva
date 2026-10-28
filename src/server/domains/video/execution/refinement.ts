import { prepareVideoBuildPlan } from "../build-plan";
import { executeImplementationHandoff } from "./implementation-handoff";
import type { VideoExecutionInput } from "./types";

/** Resume authored work with the refinement brief and existing model session. */
export async function executeRefinement(input: VideoExecutionInput) {
  const implementationPrompt = await prepareVideoBuildPlan(input.planning);
  await executeImplementationHandoff(input, implementationPrompt);
}
