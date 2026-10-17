import { InputRequired } from "../../../shared/input-checkpoint";
import { PageProductionSchema } from "../../../shared/agents/schemas/page";
import path from "node:path";
import { writeFile, copyFile } from "node:fs/promises";
import { agentTurn, type ProviderEvent } from "../../agents/providers";
import { type PageGenerationJob, type PageRequest } from "../../../shared/domains/page";
import type { ContentBrief, Style, StyleCandidate } from "../../../shared/contracts";
import { buildPagePrompt } from "./prompts";
import { validatePage } from "./validation";
import { appRoot, safeMessage } from "../../runtime/config";
import { reviewFinishedResult } from "../../jobs/subworkflows/result-review";
export async function generatePage(input: {
  job: PageGenerationJob;
  request: PageRequest;
  brief: ContentBrief;
  styles: Style[];
  candidate: StyleCandidate;
  feedback?: string;
  decisions?: string;
  signal: AbortSignal;
  update: () => void;
  onEvent: (event: ProviderEvent) => void;
  emit: (type: string, message: string) => void;
}) {
  const { job, signal, update, emit } = input;
  await copyFile(
    path.join(appRoot, "src/browser/page/motion-runtime.js"),
    path.join(job.workspace, "motion-runtime.js"),
  );
  const prompt = buildPagePrompt(input);
  await writeFile(path.join(job.workspace, "EXECUTABLE_PROMPT.md"), prompt);
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const started = Date.now();
    const reuse = attempt === 0 && job.pageProduction;
    if (reuse && input.decisions) emit("state", "Applying your decision…");
    const turn =
      reuse && !input.decisions
        ? { value: job.pageProduction!, sessionId: job.sessionId }
        : await agentTurn({
            provider: input.request.provider,
            workspace: job.workspace,
            signal,
            sessionId: job.sessionId,
            schema: PageProductionSchema,
            onEvent: input.onEvent,
            prompt: reuse
              ? `The user answered a question about this existing page. Continue this session and apply only the decision below. Inspect any newly supplied files listed in style-context.json assetInputs before using them. Keep the selected styles, approved visuals and unaffected sections unchanged. Return the page production manifest.\n\n${input.decisions}`
              : attempt === 0
                ? prompt
                : `Repair this page validation failure: ${job.error}. Preserve approved visuals. Return the page production manifest.`,
          });
    job.generationMs = (job.generationMs || 0) + Date.now() - started;
    job.sessionId = turn.sessionId;
    job.pageProduction = turn.value;
    await writeFile(
      path.join(job.workspace, "production.json"),
      JSON.stringify(turn.value, null, 2),
    );
    job.phase = "validating";
    update();
    try {
      const validationStarted = Date.now();
      try {
        Object.assign(job, await validatePage(job, turn.value, signal, emit));
      } finally {
        job.validationMs = (job.validationMs || 0) + Date.now() - validationStarted;
      }
      job.resultReview = await reviewFinishedResult({
        job,
        request: input.request,
        candidate: input.candidate,
        signal,
        onEvent: input.onEvent,
        emit,
      });
      job.phase = "ready";
      job.error = undefined;
      job.errorCode = undefined;
      job.finishedAt = new Date().toISOString();
      update();
      emit(
        "preview_ready",
        job.kind === "preview" ? "Interactive preview ready" : "Interactive page ready",
      );
      return;
    } catch (error) {
      if (error instanceof InputRequired) throw error;
      signal.throwIfAborted();
      job.error = safeMessage(error);
      emit("repair", job.error);
      if (attempt === 2) throw error;
      job.phase = "generating";
      update();
    }
  }
}
