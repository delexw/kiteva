import { generationSessionEvents } from "../../../jobs/generation-session";
import { StructuredOutputError } from "../../../agents/structured-output-error";
import { mergeCorrection } from "../../../agents/correction-merge";
import {
  ProductionSchema,
  videoGenerationOutputSchemaForDuration,
  videoRefinementOutputSchemaForTarget,
  type Production,
} from "../../../../shared/agents/schemas/video";
import { CandidateCopySchema } from "../../../../shared/agents/schemas/candidate-copy";
import { currentNarrationTrack } from "../../../audio/narration";
import type { VideoGenerationJob, VideoRequest } from "../../../../shared/domains/video";
import type { StyleCandidate } from "../../../../shared/contracts";
import { agentTurn, type ProviderEvent } from "../../../agents/providers";
import type { VideoCorrectionCoordinator } from "../corrector";
import { writeStoryboardJson } from "../storyboard";
import type { VideoBuildTurn } from "./types";

/** Own one SDK build turn, response acceptance, and storyboard-only recovery. */
export function createVideoBuildTurn(input: {
  job: VideoGenerationJob;
  request: VideoRequest;
  candidate: StyleCandidate;
  signal: AbortSignal;
  onEvent: (event: ProviderEvent) => void;
  update: () => void;
  corrector: Pick<VideoCorrectionCoordinator, "correctRound">;
  refinementDuration?: { min: number; max: number };
}): VideoBuildTurn {
  const { job, request, candidate, signal, onEvent, update, corrector, refinementDuration } = input;
  const acceptProduction = (production: Production) => {
    const merged = mergeCorrection(job.production, production, ProductionSchema);
    if (refinementDuration) job.duration = merged.duration;
    return merged;
  };
  const buildTurn = async (prompt: string) => {
    const generationStarted = Date.now();
    const turn = await agentTurn({
      includeCreativeAlternatives: false,
      provider: request.provider,
      model: job.model,
      workspace: job.workspace,
      referenceUrls: request.urls,
      enableVideoCapture:
        job.kind === "full" &&
        job.buildPlan?.value.version === 2 &&
        job.buildPlan.value.capturePlan !== undefined
          ? false
          : undefined,
      signal,
      sessionId: job.sessionId,
      schema:
        job.kind === "preview"
          ? videoGenerationOutputSchemaForDuration(job.duration).extend(CandidateCopySchema.shape)
          : refinementDuration
            ? videoRefinementOutputSchemaForTarget(job.targetDuration ?? job.duration)
            : videoGenerationOutputSchemaForDuration(job.duration),
      onEvent: generationSessionEvents(job, onEvent, update),
      prompt,
      ...(job.production ? { promptContext: { currentManifest: job.production } } : {}),
    }).catch(async (error: unknown) => {
      signal.throwIfAborted();
      if (
        !(error instanceof StructuredOutputError) ||
        !error.issues.length ||
        error.issues.some((issue) => issue.path[0] !== "storyboard")
      )
        throw error;
      // A valid manifest can be retained while the shared corrector repairs its rejected storyboard.
      const production = ProductionSchema.safeParse(error.output);
      if (!production.success) throw error;
      job.production = acceptProduction(production.data);
      job.sessionId = error.sessionId || job.sessionId;
      job.generationMs = (job.generationMs || 0) + Date.now() - generationStarted;
      const copy = CandidateCopySchema.safeParse(error.output);
      if (job.kind === "preview" && copy.success) Object.assign(candidate, copy.data);
      update();
      await corrector.correctRound([
        {
          focus: "technical",
          cheapEligible: true,
          issue: "Generated storyboard failed application validation",
          expectedFix:
            "Repair every reported storyboard validation error. Keep beats ordered and contiguous inside each scene, covering its full duration. Preserve the accepted manifest, actual animation, source assets and unrelated content; update scene code only if needed for consistency.",
          acceptanceCriteria:
            "The complete storyboard passes the existing schema and matches the composition and requested duration without relaxing validation.",
          evidence: { issues: error.issues, rejectedOutput: error.output },
        },
      ]);
      return undefined;
    });
    if (!turn) return;
    job.generationMs = (job.generationMs || 0) + Date.now() - generationStarted;
    job.sessionId = turn.sessionId || job.sessionId;
    job.speechTrack = await currentNarrationTrack(job.workspace, job.speechTrack);
    const { storyboard, ...production } = turn.value;
    const merged = acceptProduction(production);
    if (merged.assetNeeds?.length) {
      job.production = merged;
      // The orchestrator pauses only unanswered questions; answered needs may remain in a merged manifest.
      update();
    }
    await writeStoryboardJson(job.workspace, storyboard, job.duration);
    job.production = merged;
    if (job.kind === "preview") {
      const copy = CandidateCopySchema.safeParse(turn.value);
      if (copy.success) Object.assign(candidate, copy.data);
    }
    update();
  };
  return buildTurn;
}
