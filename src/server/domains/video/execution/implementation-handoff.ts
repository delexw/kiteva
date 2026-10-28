import path from "node:path";
import { writeFile } from "node:fs/promises";
import { capturedChaptersArtifact } from "../../../jobs/subworkflows/chapter-capture/workflow";
import type { VideoExecutionInput } from "./types";

/** Shared prompt persistence and accepted-footage handoff for new and refined builds. */
export async function executeImplementationHandoff(
  input: VideoExecutionInput,
  implementationPrompt: string,
) {
  const { job, prompt } = input.planning;
  const { buildTurn } = input;
  const captured = job.buildPlan?.value.version === 2 && job.buildPlan.value.capturePlan;
  const implementationHandoff =
    job.kind === "preview" || job.refinementPrompt
      ? implementationPrompt
      : `${implementationPrompt}\n\n${prompt}`;
  const assemblyPrompt = captured
    ? `${implementationHandoff}\nCAPTURE HANDOFF: Code has completed the planned chapter captures. Read ${capturedChaptersArtifact} and use its reviewed exported assets and observed results. Reconcile actual durations with the storyboard and chapter cards. Do not record the chapters again; capture tools are unavailable during assembly.`
    : implementationHandoff;
  if (assemblyPrompt !== prompt)
    await writeFile(path.join(job.workspace, "EXECUTABLE_PROMPT.md"), assemblyPrompt);
  await buildTurn(assemblyPrompt);
}
