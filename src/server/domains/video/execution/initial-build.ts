import path from "node:path";
import { previewPlanArtifact } from "../../../jobs/preview-plan";
import { prepareVideoBuildPlan } from "../build-plan";
import { executeImplementationHandoff } from "./implementation-handoff";
import type { VideoExecutionInput } from "./types";

/** Build an initial preview or full film from its approved planning inputs. */
export async function executeInitialBuild(input: VideoExecutionInput & { candidateId: string }) {
  const { planning } = input;
  const { job } = planning;
  const implementationPrompt =
    job.kind === "preview"
      ? `# Build this preview

- Read ${JSON.stringify(path.resolve(job.workspace, previewPlanArtifact))} for the shared plan and direction ${JSON.stringify(input.candidateId)}. Implement only that direction's assigned styles and scene roles.
- Read ${JSON.stringify(path.resolve(job.workspace, "VIDEO_REQUIREMENTS.md"))} for the original idea, settings, references and renderer contract.
- Build the short silent preview directly; do not return another plan or restart direction selection.
- Return the production manifest with the complete storyboard, displayTitle and displayDescription. The app validates and renders the result.`
      : await prepareVideoBuildPlan(planning);
  await executeImplementationHandoff(input, implementationPrompt);
}
