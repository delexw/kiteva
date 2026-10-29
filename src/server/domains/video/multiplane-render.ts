import {
  hasProjectLayout,
  renderInputRoot,
  renderSourcePath,
  workspaceFolders,
} from "../../runtime/workspace";
import { runVideoValidation } from "./correction-bypass";
import type { reviewRenderCache } from "../../jev/strategies/render-cache";
import { createMultiplaneRecoveryCache } from "../../rendering/multiplane/recovery-cache";
import {
  multiplaneCheckpointReusePhase,
  createMultiplaneShotProgress,
} from "../../rendering/multiplane/progress";
import { multiplaneMetadata } from "../../rendering/multiplane/metadata";
import { rendererUsesStage } from "../../rendering/execution";
import type { Production } from "../../../shared/agents/schemas/video";
import type { VideoGenerationJob } from "../../../shared/domains/video";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import {
  multiplaneInspectArgs,
  multiplaneRenderArgs,
  multiplaneShotProblems,
  multiplaneVerifyArgs,
  runMultiplane,
} from "../../rendering/multiplane";
import {
  multiplaneInputFingerprint,
  multiplaneCacheKey,
  restoreMultiplaneShot,
  storeMultiplaneShot,
} from "../../rendering/multiplane/cache";
import { multiplaneShotPlan, assembleMultiplaneShots } from "../../rendering/multiplane/shots";

export async function renderMultiplane(
  job: VideoGenerationJob,
  production: Production,
  video: string,
  fps: number,
  signal: AbortSignal,
  emit: (type: string, message: string, data?: unknown) => void,
  review?: typeof reviewRenderCache,
) {
  const shots = multiplaneShotPlan(production, job.duration, fps);
  const segmented = shots.length > 1;
  const directory = path.join(job.workspace, workspaceFolders.renders, "shots");
  if (segmented) await mkdir(directory, { recursive: true });
  let recoveryPromise: ReturnType<typeof createMultiplaneRecoveryCache> | undefined;
  const recoveryFor = (signal: AbortSignal) =>
    (recoveryPromise ??= createMultiplaneRecoveryCache({
      workspace: job.workspace,
      signal,
      onEvent: (event) => emit(event.type, event.message, event.data),
      review,
    }));
  const progress = createMultiplaneShotProgress(
    shots.map((shot) => Math.round(shot.duration * fps)),
  );
  const report = (value: ReturnType<typeof progress.snapshot>) =>
    emit("render_progress", value.message, value.data);
  report(progress.snapshot());
  const renderShot = async (index: number, shot: (typeof shots)[number], signal: AbortSignal) => {
    const recovery = await recoveryFor(signal);
    signal.throwIfAborted();
    const scope = {
      sourceFile: shot.sourceFile,
      shotSources: shots.map((item) => item.sourceFile),
      additionalFiles: !segmented && production.audioFile ? [production.audioFile] : [],
    };
    const fingerprint =
      shots.every((item) => !item.sourceFile.startsWith(`${workspaceFolders.renders}/`)) &&
      existsSync(path.join(job.workspace, shot.sourceFile))
        ? await multiplaneInputFingerprint(job.workspace, signal, scope)
        : undefined;
    const label = segmented ? ` (${index + 1}/${shots.length}: ${shot.sourceFile})` : "";
    const part = `shot-${index}.${multiplaneMetadata.execution.format[job.kind]}`;
    const output = segmented ? path.join(directory, part) : video;
    const key = fingerprint
      ? multiplaneCacheKey(fingerprint, {
          shot,
          fps,
          width: production.width,
          height: production.height,
          kind: job.kind,
          policy: multiplaneMetadata.execution,
          correctionBypasses: job.correctionBypasses?.map((bypass) => bypass.issueKey),
          audioFile: segmented ? null : production.audioFile,
        })
      : undefined;
    const cacheSettings = {
      shot,
      fps,
      width: production.width,
      height: production.height,
      kind: job.kind,
      policy: multiplaneMetadata.execution,
      correctionBypasses: job.correctionBypasses?.map((bypass) => bypass.issueKey),
      audioFile: segmented ? null : production.audioFile,
    };
    if (
      (key &&
        fingerprint &&
        (await restoreMultiplaneShot({
          workspace: job.workspace,
          key,
          output,
          fingerprint,
          signal,
          scope,
        }))) ||
      (await recovery?.restore(shot.sourceFile, cacheSettings, output))
    ) {
      emit("phase", `${multiplaneCheckpointReusePhase}${label}`);
      report(progress.complete(index));
      return part;
    }
    if (rendererUsesStage(multiplaneMetadata, job.kind, "inspect")) {
      emit(
        "validation",
        `Checking the Multiplane shot: stage size, duration and frame rate${label}`,
      );
      const inspected = await runMultiplane(
        "inspect",
        multiplaneInspectArgs(
          hasProjectLayout(job.workspace)
            ? renderSourcePath(job.workspace, shot.sourceFile)
            : shot.sourceFile,
        ),
        renderInputRoot(job.workspace),
        signal,
        () => {},
        180000,
      );
      const problems = multiplaneShotProblems(inspected.data, {
        width: production.width,
        height: production.height,
        duration: shot.duration,
        fps,
      });
      if (problems.length)
        throw Error(
          `Multiplane shot ${shot.sourceFile} does not match the requested output: ${problems.join("; ")}`,
        );
    }
    if (rendererUsesStage(multiplaneMetadata, job.kind, "verify")) {
      emit("validation", `Checking that every frame depends only on time${label}`);
      await runVideoValidation(
        job,
        async () => {
          await runMultiplane(
            "verify",
            multiplaneVerifyArgs(
              hasProjectLayout(job.workspace)
                ? renderSourcePath(job.workspace, shot.sourceFile)
                : shot.sourceFile,
              fps,
              hasProjectLayout(job.workspace)
                ? path.join(job.workspace, workspaceFolders.multiplaneJobs)
                : undefined,
            ),
            renderInputRoot(job.workspace),
            signal,
          );
        },
        emit,
      );
    }
    emit("phase", `Rendering the Multiplane shot${label}`);
    await runMultiplane(
      "render",
      multiplaneRenderArgs({
        shot: hasProjectLayout(job.workspace)
          ? renderSourcePath(job.workspace, shot.sourceFile)
          : shot.sourceFile,
        output: hasProjectLayout(job.workspace) ? output : path.relative(job.workspace, output),
        jobDirectory: hasProjectLayout(job.workspace)
          ? path.join(job.workspace, workspaceFolders.multiplaneJobs)
          : undefined,
        fps,
        kind: job.kind,
        audioFile: segmented
          ? null
          : production.audioFile && hasProjectLayout(job.workspace)
            ? renderSourcePath(job.workspace, production.audioFile)
            : production.audioFile,
      }),
      renderInputRoot(job.workspace),
      signal,
      (text) => {
        const value = progress.frame(index, text);
        if (value) report(value);
      },
    );
    await recovery?.store(shot.sourceFile, cacheSettings, output);
    if (key && fingerprint)
      await storeMultiplaneShot({
        workspace: job.workspace,
        key,
        output,
        fingerprint,
        signal,
        scope,
      });
    signal.throwIfAborted();
    report(progress.complete(index));
    return part;
  };
  const parts: string[] = [];
  for (const [index, shot] of shots.entries()) {
    signal.throwIfAborted();
    parts.push(await renderShot(index, shot, signal));
  }
  if (segmented) {
    emit("phase", "Joining the Multiplane shots and continuous soundtrack");
    await assembleMultiplaneShots({
      directory,
      parts,
      output: video,
      duration: job.duration,
      audioFile:
        job.kind === "full" && production.audioFile
          ? path.resolve(job.workspace, production.audioFile)
          : null,
      signal,
    });
  }
}
