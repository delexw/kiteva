import { localizeVideoRequest } from "../../jobs/subworkflows/video-localization";
import { deliverySpeech, narrationLanguage } from "../../../shared/video-language";
import { InputRequired } from "../../../shared/input-checkpoint";
import { CodedError } from "../../../shared/errors";
import { prepareSpeech } from "../../audio/speech";
import { RendererDiagnosticError, rendererCorrectionEvidence } from "../../rendering/diagnostics";
import { prepareVideoBuildPlan } from "./build-plan";
import {
  BriefSchema,
  videoGenerationOutputSchemaForDuration,
  type Brief,
} from "../../../shared/agents/schemas/video";
import { CandidateCopySchema } from "../../../shared/agents/schemas/candidate-copy";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { dimensions, type Style, type StyleCandidate } from "../../../shared/contracts";
import type { VideoRequest, VideoGenerationJob } from "../../../shared/domains/video";
import { agentTurn, type ProviderEvent } from "../../agents/providers";
import { buildVideoPrompt } from "./prompts";
import { renderJob } from "../../rendering/render";
import { safeMessage } from "../../runtime/config";
import { VideoCorrectionCoordinator } from "./corrector";
import { VideoQaError, VideoQaReportError, resultReviewFindings } from "./qa";
import { reviewFinishedResult } from "../../jobs/subworkflows/result-review";
import { validateStoryboardJson, writeStoryboardJson } from "./storyboard";
import { rendererPipelineProblem, videoRendererOf } from "../../../shared/video-renderers";

export async function generateVideo(input: {
  job: VideoGenerationJob;
  request: VideoRequest;
  brief: Brief;
  candidate: StyleCandidate;
  styles: Style[];
  feedback?: string;
  decisions?: string;
  signal: AbortSignal;
  update: () => void;
  onEvent: (event: ProviderEvent) => void;
  emit: (type: string, message: string) => void;
  render: <T>(task: () => Promise<T>) => Promise<T>;
}) {
  const {
    job,
    request: sourceRequest,
    brief,
    candidate,
    styles,
    feedback,
    decisions,
    signal,
    update,
    onEvent,
    emit,
    render,
  } = input;
  let request = await localizeVideoRequest(
    sourceRequest,
    path.join(job.workspace, "localization"),
    signal,
    onEvent,
  );
  request = { ...request, speech: deliverySpeech(request) };
  if (
    request.speech?.mode === "narration" &&
    request.speech.source === "lyrics" &&
    request.lyrics?.mode === "provided" &&
    request.outputLanguage &&
    narrationLanguage(request)?.split("-")[0] !== request.outputLanguage
  ) {
    const localized = await localizeVideoRequest(
      {
        ...request,
        speech: { ...request.speech, source: "provided", text: request.lyrics.text },
        translations: { original: { narration: request.lyrics.text }, versions: {} },
      },
      path.join(job.workspace, "localization"),
      signal,
      onEvent,
    );
    request = { ...request, speech: localized.speech };
  }
  const fps = request.frameRate ?? 30;
  const size = dimensions(
    request.aspectRatio,
    job.kind === "preview" ? 720 : request.resolution === "1440p" ? 1440 : 1080,
  );
  job.speechTrack =
    job.kind === "full"
      ? await prepareSpeech({
          request,
          brief,
          workspace: job.workspace,
          duration: job.duration,
          signal,
          onEvent,
          emit,
        })
      : undefined;
  if (job.speechTrack) update();
  const prompt = buildVideoPrompt({
    job,
    candidate: candidate,
    styles: styles,
    brief: BriefSchema.parse(brief),
    request: request,
    ...size,
    feedback,
    speechTrack: job.speechTrack,
  });
  await writeFile(path.join(job.workspace, "EXECUTABLE_PROMPT.md"), prompt);
  const corrector = new VideoCorrectionCoordinator({
    job,
    provider: request.provider,
    signal,
    onEvent,
    update,
    emit,
  });
  const buildTurn = async (prompt: string) => {
    const generationStarted = Date.now();
    const turn = await agentTurn({
      provider: request.provider,
      model: job.model,
      workspace: job.workspace,
      referenceUrls: request.urls,
      allowInstrumentRendering: job.kind === "full",
      signal,
      sessionId: job.sessionId,
      schema:
        job.kind === "preview"
          ? videoGenerationOutputSchemaForDuration(job.duration).extend(CandidateCopySchema.shape)
          : videoGenerationOutputSchemaForDuration(job.duration),
      onEvent,
      prompt,
    });
    job.generationMs = (job.generationMs || 0) + Date.now() - generationStarted;
    job.sessionId = turn.sessionId || job.sessionId;
    const { storyboard, ...production } = turn.value;
    await writeStoryboardJson(job.workspace, storyboard, job.duration);
    job.production = production;
    if (job.kind === "preview") {
      const copy = CandidateCopySchema.safeParse(turn.value);
      if (copy.success) Object.assign(candidate, copy.data);
    }
  };
  if (!job.production) {
    const implementationPrompt = await prepareVideoBuildPlan({
      job,
      provider: request.provider,
      prompt,
      ...size,
      fps,
      signal,
      onEvent,
      update,
    });
    if (implementationPrompt !== prompt)
      await writeFile(path.join(job.workspace, "EXECUTABLE_PROMPT.md"), implementationPrompt);
    await buildTurn(implementationPrompt);
  } else if (decisions) {
    emit("state", "Applying your decision…");
    await buildTurn(
      `The user answered a question about this existing ${job.kind === "preview" ? "preview" : "full video"}. Continue this session and apply only the decision below to the current composition. Inspect any newly supplied files listed in style-context.json assetInputs before using them. Keep the selected Motion Graphics, ${job.duration}s duration, dimensions, ${fps} fps and every unaffected scene unchanged. Read STORYBOARD.json completely and return the updated production manifest and complete storyboard.\n\n${decisions}`,
    );
    update();
  }
  while (true) {
    signal.throwIfAborted();
    const production = job.production!;
    try {
      if (production.fps !== undefined && production.fps !== fps)
        throw Error("Agent manifest does not match requested frame rate");
      production.fps = fps;
      if (
        production.duration !== job.duration ||
        production.width !== size.width ||
        production.height !== size.height
      )
        throw Error("Agent manifest does not match requested dimensions or duration");
      if (
        production.styleRenderer.some((x) => /^(HyperFrames|Remotion|Multiplane)$/i.test(x)) ||
        production.motionEngine.some((x) => /^(HyperFrames|Remotion|Multiplane)$/i.test(x))
      )
        throw Error("Composition framework cannot own the visual renderer or motion engine");
      const pipelineProblem = rendererPipelineProblem(
        videoRendererOf(request),
        production.pipeline,
      );
      if (pipelineProblem) throw Error(pipelineProblem);
      job.phase = "validating";
      update();
      await writeFile(
        path.join(job.workspace, "production.json"),
        JSON.stringify(production, null, 2),
      );
      await validateStoryboardJson(job.workspace, job.duration);
      const artifacts = await render(async () => {
        signal.throwIfAborted();
        job.phase = "rendering";
        update();
        const renderStarted = Date.now();
        try {
          return await renderJob(
            job,
            production,
            signal,
            (type, msg) => emit(type, msg),
            job.speechTrack,
          );
        } finally {
          job.renderMs = (job.renderMs || 0) + Date.now() - renderStarted;
        }
      });
      Object.assign(job, artifacts);
      await validateStoryboardJson(job.workspace, job.duration);
      job.resultReview = await reviewFinishedResult({
        job,
        request,
        candidate,
        signal,
        onEvent,
        emit,
      });
      const reviewFindings = resultReviewFindings(job.resultReview);
      if (reviewFindings.length) throw new VideoQaError(reviewFindings);
      job.phase = "ready";
      job.error = undefined;
      job.errorCode = undefined;
      job.finishedAt = new Date().toISOString();
      update();
      emit("preview_ready", `${job.kind === "preview" ? "Preview" : "Full video"} ready`);
      break;
    } catch (error) {
      if (error instanceof InputRequired) throw error;
      if (error instanceof CodedError && error.code.startsWith("SPEECH_")) throw error;
      signal.throwIfAborted();
      if (error instanceof VideoQaReportError) throw error;
      job.error = safeMessage(error);
      job.phase = "generating";
      update();
      const findings =
        error instanceof VideoQaError
          ? error.findings
          : [
              {
                focus: "technical" as const,
                cheapEligible: false,
                evidence:
                  error instanceof RendererDiagnosticError
                    ? rendererCorrectionEvidence(error.diagnostics, error.reportFile)
                    : job.error,
              },
            ];
      await corrector.correctRound(findings);
      job.error = undefined;
      job.errorCode = undefined;
      job.resultReview = undefined;
      update();
    }
  }
}
