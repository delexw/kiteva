import { remainingCorrectionFindings, videoFailureFindings } from "./correction-bypass";
import { createVideoBuildTurn } from "./execution/build-turn";
import { executeInitialBuild } from "./execution/initial-build";
import { executeRefinement } from "./execution/refinement";
import { executeQuestionResume } from "./execution/question-resume";
import { applyLanguageTracks } from "../../../shared/language-tracks";
import { buildLanguageMedia } from "./language-media";
import { activityScope } from "../../jobs/activity-scope";
import { videoDurationRange } from "../../../shared/video-duration";
import { currentNarrationTrack, prepareNarrationCapability } from "../../audio/narration";
import { localizeVideoRequest } from "../../jobs/subworkflows/video-localization";
import { deliverySpeech, narrationLanguage } from "../../../shared/video-language";
import { InputRequired } from "../../../shared/input-checkpoint";
import { CodedError } from "../../../shared/errors";
import { prepareSpeech } from "../../audio/speech";
import { prepareVideoBuildPlan } from "./build-plan";
import { captureWithTimingRetries } from "../../jobs/subworkflows/chapter-capture/timing-retry";
import { BriefSchema, type Brief } from "../../../shared/agents/schemas/video";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { dimensions, type Style, type StyleCandidate } from "../../../shared/contracts";
import type { VideoRequest, VideoGenerationJob } from "../../../shared/domains/video";
import type { ProviderEvent } from "../../agents/providers";
import { buildVideoPrompt } from "./prompts";
import { renderJob } from "../../rendering/render";
import { safeMessage } from "../../runtime/config";
import { VideoCorrectionCoordinator } from "./corrector";
import { VideoQaError, VideoQaReportError, resultReviewFindings } from "./qa";
import { reviewFinishedResult } from "../../jobs/subworkflows/result-review";
import { validateStoryboardJson } from "./storyboard";
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
  if (input.job.kind === "full") {
    const targetDuration =
      typeof input.request.duration === "number" ? input.request.duration : undefined;
    if (input.job.targetDuration !== targetDuration) {
      input.job.targetDuration = targetDuration;
      input.update();
    }
  }
  return activityScope("Creating your video", async () => {
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
    if (job.kind === "full") job.languageMedia = undefined;
    let request = await localizeVideoRequest(
      applyLanguageTracks(sourceRequest),
      path.join(job.workspace, "localization"),
      signal,
      onEvent,
    );
    request = { ...request, speech: deliverySpeech(request) };
    if (
      request.scriptItems === undefined &&
      request.speech?.mode === "narration" &&
      request.speech.source === "subtitles" &&
      request.subtitles?.mode === "provided" &&
      request.outputLanguage &&
      narrationLanguage(request)?.split("-")[0] !== request.outputLanguage
    ) {
      const localized = await localizeVideoRequest(
        {
          ...request,
          speech: { ...request.speech, source: "provided", text: request.subtitles.text },
          translations: { original: { narration: request.subtitles.text }, versions: {} },
        },
        path.join(job.workspace, "localization"),
        signal,
        onEvent,
      );
      request = { ...request, speech: localized.speech };
    }
    if (job.kind === "preview" && !job.production && job.buildPlan) {
      if (job.sessionId === job.buildPlan.sessionId) job.sessionId = undefined;
      job.buildPlan = undefined;
      update();
    }
    const fps = request.frameRate ?? 30;
    const size = dimensions(
      request.aspectRatio,
      job.kind === "preview" ? 720 : request.resolution === "1440p" ? 1440 : 1080,
    );
    if (job.kind === "full" && !job.production && !job.refinementPrompt) {
      const planningInput = {
        job,
        provider: request.provider,
        prompt: buildVideoPrompt({
          job,
          candidate,
          styles,
          brief,
          request,
          ...size,
          feedback,
          applicationDemoStage: "planning",
        }),
        referenceUrls: request.urls,
        automaticDuration: request.duration === "auto",
        targetDuration: typeof request.duration === "number" ? request.duration : undefined,
        minimumDuration: Math.max(0, ...(request.scriptItems || []).map((item) => item.endSeconds)),
        ...size,
        fps,
        signal,
        onEvent,
        update,
      };
      await prepareVideoBuildPlan(planningInput);
      const planned = job.buildPlan?.value;
      if (planned?.version === 2 && planned.capturePlan) {
        await captureWithTimingRetries({ job, request, signal, onEvent, update });
      }
    }
    const refinementDuration =
      job.kind === "full" && job.refinementPrompt
        ? videoDurationRange(job.targetDuration ?? job.duration)
        : undefined;
    const narrationRequired =
      job.kind === "full" &&
      (await prepareNarrationCapability(
        job.workspace,
        request,
        refinementDuration?.max ?? job.duration,
      ));
    // Uploaded recordings are imported; generated narration is created only through MCP.
    job.speechTrack =
      job.kind === "full" &&
      request.scriptItems === undefined &&
      request.speech?.mode === "uploaded"
        ? await prepareSpeech({
            request,
            brief,
            workspace: job.workspace,
            duration: refinementDuration?.max ?? job.duration,
            signal,
            onEvent,
            emit,
          })
        : narrationRequired
          ? await currentNarrationTrack(job.workspace)
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
    const requirementsFile = path.resolve(job.workspace, "VIDEO_REQUIREMENTS.md");
    await writeFile(requirementsFile, prompt);
    await writeFile(path.join(job.workspace, "EXECUTABLE_PROMPT.md"), prompt);
    const corrector = new VideoCorrectionCoordinator({
      job,
      provider: request.provider,
      signal,
      onEvent,
      update,
      emit,
    });
    const buildTurn = createVideoBuildTurn({
      job,
      request,
      candidate,
      signal,
      onEvent,
      update,
      corrector,
      refinementDuration,
    });
    const execution = {
      planning: {
        referenceUrls: request.urls,
        automaticDuration: request.duration === "auto",
        targetDuration: typeof request.duration === "number" ? request.duration : undefined,
        minimumDuration: Math.max(0, ...(request.scriptItems || []).map((item) => item.endSeconds)),
        job,
        provider: request.provider,
        prompt,
        ...size,
        fps,
        signal,
        onEvent,
        update,
      },
      buildTurn,
    };
    if (!job.production) {
      if (job.refinementPrompt) await executeRefinement(execution);
      else await executeInitialBuild({ ...execution, candidateId: candidate.id });
    } else if (decisions) {
      await executeQuestionResume({ ...execution, decisions, emit, refinementDuration });
    }
    while (true) {
      signal.throwIfAborted();
      const production = job.production!;
      job.speechTrack = await currentNarrationTrack(job.workspace, job.speechTrack);
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
        if (narrationRequired && !job.speechTrack)
          throw Error(
            "Narration is configured but has not been created. Call create_narration before rendering.",
          );
        const artifacts = await activityScope("Rendering your video", () =>
          render(async () => {
            signal.throwIfAborted();
            job.phase = "rendering";
            update();
            const renderStarted = Date.now();
            try {
              return await renderJob(
                job,
                production,
                signal,
                (type, msg, data) =>
                  data === undefined ? emit(type, msg) : onEvent({ type, message: msg, data }),
                job.speechTrack,
                ...(request.languageTracks ? ([true] as const) : []),
              );
            } finally {
              job.renderMs = (job.renderMs || 0) + Date.now() - renderStarted;
            }
          }),
        );
        Object.assign(job, artifacts);
        if (job.kind === "full" && request.languageTracks) {
          job.languageMedia = await activityScope("Preparing language tracks", () =>
            buildLanguageMedia({ job, request, brief, signal, onEvent, emit }),
          );
          update();
        }
        await validateStoryboardJson(job.workspace, job.duration);
        if (job.kind === "full") {
          job.resultReview = await reviewFinishedResult({
            job,
            request,
            candidate,
            signal,
            onEvent,
            emit,
          });
          const reviewFindings = remainingCorrectionFindings(
            job,
            resultReviewFindings(job.resultReview),
            (type, message, data) => onEvent({ type, message, data }),
          );
          if (reviewFindings.length) throw new VideoQaError(reviewFindings);
        }
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
        const findings = remainingCorrectionFindings(
          job,
          videoFailureFindings(error),
          (type, message, data) => onEvent({ type, message, data }),
        );
        if (!findings.length) throw error; // A renderer that cannot produce output cannot be skipped.
        await corrector.correctRound(findings);
        job.error = undefined;
        job.errorCode = undefined;
        job.resultReview = undefined;
        update();
      }
    }
  });
}
