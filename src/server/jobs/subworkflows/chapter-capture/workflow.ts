import { activityScope } from "../../activity-scope";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, rename, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  captureChapterDirectory,
  type CaptureChapterPlan,
  type CaptureChapterProgress,
} from "../../../../shared/capture-chapters";
import type { VideoGenerationJob, VideoRequest } from "../../../../shared/domains/video";
import { agentTurn, type ProviderEvent } from "../../../agents/providers";
import { nativeCapturePolicy } from "../../../capture/native-editor";
import { textModels } from "../../../agents/models";
import { probeVideo } from "../../../rendering/video-probe";
import {
  ChapterTimingConflictError,
  type ChapterTimingConflict,
  validateChapterTiming,
} from "../../../capture/chapter-timing";
import { ChapterCaptureExportSchema } from "../website-capture";
import { captureCursorAppearance, captureFramingAppearance } from "../../../capture/presentation";
import { buildChapterCapturePrompt, chapterTimingRetryGuidance } from "./prompt";
import { emitChapterTiming, captureOperationOutcomes } from "./events";

import {
  capturedChaptersArtifact,
  ChapterResultSchema,
  ChapterCaptureResponseSchema,
  SavedChapterSchema,
  readCapturedChapters,
} from "./handoff";

export { capturedChaptersArtifact } from "./handoff";

async function capturedFileHash(workspace: string, assetPath: string, signal: AbortSignal) {
  const root = await realpath(workspace);
  const file = await realpath(path.resolve(root, assetPath));
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw Error("Capture is outside this workspace");
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file, { signal })) hash.update(bytes);
  return hash.digest("hex");
}

/** Code owns ordering, retries/checkpoints and measured progress; the model owns each take. */
export async function prepareChapterCaptures(
  input: {
    job: VideoGenerationJob;
    request: VideoRequest;
    plan: CaptureChapterPlan;
    timingRetry?: ChapterTimingConflict;
    signal: AbortSignal;
    onEvent: (event: ProviderEvent) => void;
    update: () => void;
  },
  generate: typeof agentTurn = agentTurn,
) {
  return activityScope("Capturing chapters", async () => {
    const { job, request, plan, signal, onEvent, update } = input;
    const captureModel = request.provider === "claude" ? textModels.claude : job.model;
    if (!job.sessionId) throw Error("Chapter capture requires the main planning session");
    if (!request.urls?.length) throw Error("Chapter capture requires the planned reference URL");
    const artifact = path.join(job.workspace, capturedChaptersArtifact);
    const planningSessionId = job.sessionId;
    const usedSessionIds = new Set([planningSessionId]);
    let saved: Awaited<ReturnType<typeof readCapturedChapters>> | undefined;
    try {
      saved = await readCapturedChapters(job.workspace);
      for (const chapter of saved.chapters) {
        if (chapter.sessionId) usedSessionIds.add(chapter.sessionId);
      }
    } catch {
      signal.throwIfAborted();
    }
    const completed: z.infer<typeof SavedChapterSchema>[] = [];
    const progress = (value: CaptureChapterProgress) =>
      onEvent({
        type: "capture_progress",
        message: "Capturing footage…",
        data: { captureProgress: value },
      });
    for (const [index, chapter] of plan.chapters.entries()) {
      await activityScope(`Chapter ${index + 1} · ${chapter.title}`, async () => {
        signal.throwIfAborted();
        const metadata = {
          chapterId: chapter.id,
          title: chapter.title,
          index: index + 1,
          total: plan.chapters.length,
        };
        const emit = (status: CaptureChapterProgress["status"]) =>
          progress({ ...metadata, completed: completed.length, status });
        emit("running");
        const capturePrompt = buildChapterCapturePrompt({
          workspace: job.workspace,
          storyboard:
            job.buildPlan?.value.version === 2 ? job.buildPlan.value.storyboard : undefined,
          request,
          plan,
          chapter,
          index,
          previousResult: completed.at(-1)?.result ?? null,
          previousChapterContext: completed.at(-1)?.chapter.nextChapterContext ?? null,
        });
        const fingerprint = createHash("sha256")
          .update(
            JSON.stringify({
              prompt: capturePrompt,
              model: captureModel,
              provider: request.provider,
              capturePolicy: {
                nativeCapturePolicy,
                cursor: captureCursorAppearance,
                framing: captureFramingAppearance,
              },
              previousCaptureSha256: completed.at(-1)?.sha256 ?? null,
            }),
          )
          .digest("hex");
        try {
          const previous = saved?.chapters.find(
            (item) => item.chapter.id === chapter.id && item.fingerprint === fingerprint,
          );
          let reusable = false;
          if (previous) {
            try {
              reusable =
                previous.evidence.chapterId === chapter.id &&
                previous.evidence.recording.assetPath === previous.result.assetPath &&
                previous.cursorSha256 !== undefined &&
                (await capturedFileHash(
                  job.workspace,
                  previous.evidence.recording.cursorPath,
                  signal,
                )) === previous.cursorSha256 &&
                (await capturedFileHash(job.workspace, previous.result.assetPath, signal)) ===
                  previous.sha256;
            } catch {
              signal.throwIfAborted();
            }
          }
          if (previous && reusable) completed.push(previous);
          else {
            // Never accept an artifact from an earlier failed attempt as this call's evidence.
            const evidencePath = path.join(
              job.workspace,
              captureChapterDirectory,
              `${chapter.id}.json`,
            );
            await rm(evidencePath, { force: true });
            const started = Date.now();
            let result: z.infer<typeof ChapterResultSchema>;
            let chapterSessionId: string;
            try {
              const turn: {
                value: z.infer<typeof ChapterCaptureResponseSchema>;
                sessionId?: string;
              } = await generate({
                provider: request.provider,
                model: captureModel,
                workspace: job.workspace,
                referenceUrls: request.urls,
                enableVideoCapture: true,
                captureChapterId: chapter.id,
                captureChapterDurationSeconds: chapter.estimatedDurationSeconds,
                includeCreativeAlternatives: false,
                signal,
                schema: ChapterCaptureResponseSchema,
                onEvent: (event) => {
                  if (
                    event.type === "session" &&
                    (event.data as { sessionId?: string } | undefined)?.sessionId ===
                      planningSessionId
                  )
                    throw Error("Chapter capture must use a new session, separate from planning");
                  onEvent({
                    ...event,
                    data: { ...(event.data as object), captureChapter: metadata },
                  });
                  for (const outcome of captureOperationOutcomes(event)) {
                    emitChapterTiming(onEvent, {
                      ...metadata,
                      ...outcome,
                      targetDurationSeconds: chapter.estimatedDurationSeconds,
                    });
                    if (
                      outcome.status === "complete" &&
                      (outcome.phase === "recording" || outcome.phase === "speed")
                    )
                      emitChapterTiming(onEvent, {
                        ...metadata,
                        phase: "review",
                        status: "running",
                        targetDurationSeconds: chapter.estimatedDurationSeconds,
                      });
                  }
                },
                prompt:
                  input.timingRetry?.chapterId === chapter.id
                    ? `${capturePrompt}\n${chapterTimingRetryGuidance(input.timingRetry)}`
                    : capturePrompt,
              });
              signal.throwIfAborted();
              if (!turn.sessionId || usedSessionIds.has(turn.sessionId))
                throw Error("Each chapter capture must return its own new session");
              usedSessionIds.add(turn.sessionId);
              chapterSessionId = turn.sessionId;
              if ("captureFailure" in turn.value.outcome)
                throw Error(`Chapter capture failed: ${turn.value.outcome.captureFailure.reason}`);
              if ("timingConflict" in turn.value.outcome)
                throw new ChapterTimingConflictError({
                  chapterId: chapter.id,
                  targetDurationSeconds: chapter.estimatedDurationSeconds,
                  ...turn.value.outcome.timingConflict,
                });
              result = ChapterResultSchema.parse(turn.value.outcome);
            } finally {
              job.generationMs = (job.generationMs || 0) + Date.now() - started;
              update();
            }
            const evidence = ChapterCaptureExportSchema.parse(
              JSON.parse(await readFile(evidencePath, "utf8")),
            );
            if (
              evidence.chapterId !== chapter.id ||
              evidence.recording.assetPath !== result.assetPath
            )
              throw Error("Chapter result does not match its reviewed native export");
            emitChapterTiming(onEvent, {
              ...metadata,
              phase: "validation",
              status: "running",
              targetDurationSeconds: chapter.estimatedDurationSeconds,
            });
            const probe = await probeVideo(path.join(job.workspace, result.assetPath), signal);
            const duration = Number(probe.format.duration);
            const cursor = JSON.parse(
              await readFile(path.join(job.workspace, evidence.recording.cursorPath), "utf8"),
            );
            const trimRanges = z.array(z.unknown()).parse(cursor.nativeTrimRegions);
            validateChapterTiming(
              duration,
              chapter.estimatedDurationSeconds,
              trimRanges.length > 0,
              chapter.id,
            );
            evidence.recording.duration = duration;
            result = ChapterResultSchema.parse({ ...result, actualDurationSeconds: duration });
            emitChapterTiming(onEvent, {
              ...metadata,
              phase: "validation",
              status: "complete",
              targetDurationSeconds: chapter.estimatedDurationSeconds,
              actualDurationSeconds: duration,
            });
            const [sha256, cursorSha256] = await Promise.all([
              capturedFileHash(job.workspace, result.assetPath, signal),
              capturedFileHash(job.workspace, evidence.recording.cursorPath, signal),
            ]);
            completed.push({
              chapter,
              sessionId: chapterSessionId,
              fingerprint,
              sha256,
              cursorSha256,
              result,
              evidence,
            });
          }
          // Keep unvisited entries for validation later; progress counts only completed chapters.
          const checkpoints = new Map(
            [...(saved?.chapters ?? []), ...completed].map((capture) => [
              capture.chapter.id,
              capture,
            ]),
          );
          const chapters = plan.chapters.flatMap(({ id }) => {
            const checkpoint = checkpoints.get(id);
            return checkpoint ? [checkpoint] : [];
          });
          const temporary = `${artifact}.${randomUUID()}.tmp`;
          try {
            await writeFile(
              temporary,
              JSON.stringify(
                { version: 1, scope: plan.scope, story: plan.story, chapters },
                null,
                2,
              ),
            );
            signal.throwIfAborted();
            await rename(temporary, artifact);
          } finally {
            await rm(temporary, { force: true });
          }
          emitChapterTiming(onEvent, {
            ...metadata,
            phase: "accepted",
            status: "complete",
            targetDurationSeconds: chapter.estimatedDurationSeconds,
            actualDurationSeconds: completed.at(-1)!.evidence.recording.duration,
          });
          emit("complete");
        } catch (error) {
          emit(signal.aborted ? "stopped" : "failed");
          throw error;
        }
      });
    }
    return capturedChaptersArtifact;
  });
}
