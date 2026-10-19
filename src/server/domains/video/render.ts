import { videoRenderTimeoutMs } from "../../rendering/timeouts";
import { type Production } from "../../../shared/agents/schemas/video";
import { withContentReveal } from "../../motion/content-reveal";
import { withArrowDrawing } from "../../motion/arrow-drawing";
import type { VideoGenerationJob } from "../../../shared/domains/video";
import path from "node:path";
import type { SpeechTrack } from "../../../shared/speech";
import { mixSpeech } from "../../audio/speech";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { command, isolatedCommand } from "../../runtime/process.js";
import { appRoot } from "../../runtime/config.js";
import { probeVideo } from "../../rendering/video-probe";
import { previewVideoFile, transcodePreviewToWebm } from "../../rendering/webm-video";
import {
  cardClipFile,
  cardClipStart,
  makeCardClip,
  makeViewingWebm,
  playbackCopyProfile,
  viewingVideoFile,
} from "../../rendering/playback-copies";
import { readStoryboardJson } from "./storyboard";
import {
  multiplaneInspectArgs,
  multiplaneRenderArgs,
  multiplaneShotProblems,
  multiplaneVerifyArgs,
  runMultiplane,
} from "../../rendering/multiplane";

import { redactSecrets, safeMessage } from "../../runtime/config";
import { VideoQaError, VideoQaReportError, VideoQaReportSchema, videoQaFindings } from "./qa";
export const hyperframesCli = path.join(appRoot, "node_modules/hyperframes/bin/hyperframes.mjs");
export function hasRemoteResources(html: string) {
  // SVG labels can display URLs without loading resources. Keep attribute and script URLs checked.
  const resources = html
    .replace(/(<text\b[^>]*>)[\s\S]*?(<\/text>)/gi, "$1$2")
    .replace(/https?:\/\/www\.w3\.org\/[\w/]+/g, "");
  return /https?:\/\//.test(resources);
}
async function renderHyperFrames(
  job: VideoGenerationJob,
  production: Production,
  video: string,
  out: string,
  fps: number,
  signal: AbortSignal,
  emit: (type: string, message: string) => void,
) {
  if (production.sourceFile !== "index.html")
    throw Error("HyperFrames entry point must be index.html");
  const originalHtml = await readFile(path.join(job.workspace, "index.html"), "utf8");
  const html = withContentReveal(withArrowDrawing(originalHtml));
  if (html !== originalHtml) await writeFile(path.join(job.workspace, "index.html"), html);
  if (hasRemoteResources(html))
    throw Error(
      "Composition contains a remote URL. Localize assets and dependencies before rendering.",
    );
  emit("validation", "Checking composition, seekable motion, layout, and contrast");
  let qaOutput = "";
  let checkError: unknown;
  try {
    await isolatedCommand(
      process.execPath,
      [hyperframesCli, "check", job.workspace, "--json", "--snapshots"],
      job.workspace,
      signal,
      () => {},
      180000,
      (text) => {
        qaOutput += text;
      },
    );
  } catch (error) {
    signal.throwIfAborted();
    checkError = error;
  }
  await writeFile(path.join(out, "qa-stdout.txt"), redactSecrets(qaOutput));
  let report: unknown;
  let parseError: string | undefined;
  try {
    report = JSON.parse(qaOutput);
  } catch (error) {
    parseError = safeMessage(error);
  }
  const parsed = VideoQaReportSchema.safeParse(report);
  if (!parsed.success) {
    const diagnostics = {
      issue: parseError
        ? `QA stdout is not valid JSON: ${parseError}`
        : "QA JSON does not match the required report schema",
      expectedFix:
        "Repair the QA command or report reader using the saved output and parsing/schema diagnostics. Do not modify the video without evidence of a composition failure.",
      evidence: {
        stdoutFile: "renders/qa-stdout.txt",
        parseError,
        schemaIssues: parsed.error.issues,
        commandError: checkError ? safeMessage(checkError) : undefined,
      },
    };
    await writeFile(path.join(out, "qa-report-error.json"), JSON.stringify(diagnostics, null, 2));
    throw new VideoQaReportError(diagnostics);
  }
  await writeFile(
    path.join(out, "qa-report.json"),
    JSON.stringify(
      parsed.data,
      (_key, value) => (typeof value === "string" ? redactSecrets(value) : value),
      2,
    ),
  );
  const findings = videoQaFindings(parsed.data);
  if (findings.length) throw new VideoQaError(findings);
  if (checkError) throw checkError;
  emit("validation", "Composition, layout, motion, and contrast checks passed");
  emit("phase", "Rendering validated composition");
  await isolatedCommand(
    process.execPath,
    [
      hyperframesCli,
      "render",
      job.workspace,
      "--output",
      video,
      "--fps",
      String(fps),
      "--quality",
      job.kind === "preview" ? "draft" : "delivery",
    ],
    job.workspace,
    signal,
    (t) => emit("render_progress", t),
    videoRenderTimeoutMs,
  );
}
async function renderRemotion(
  job: VideoGenerationJob,
  production: Production,
  video: string,
  fps: number,
  signal: AbortSignal,
  emit: (type: string, message: string) => void,
) {
  if (!production.fallbackReason?.trim())
    throw Error("Remotion fallback requires a verified reason");
  await isolatedCommand(
    process.execPath,
    [
      path.join(appRoot, "node_modules/@remotion/cli/remotion-cli.js"),
      "render",
      production.sourceFile,
      "Video",
      video,
      "--fps",
      String(fps),
      "--width",
      String(production.width),
      "--height",
      String(production.height),
      "--frames",
      `0-${Math.round(job.duration * fps) - 1}`,
    ],
    job.workspace,
    signal,
    (t) => emit("render_progress", t),
    videoRenderTimeoutMs,
  );
}
async function renderMultiplane(
  job: VideoGenerationJob,
  production: Production,
  video: string,
  fps: number,
  signal: AbortSignal,
  emit: (type: string, message: string) => void,
) {
  if (!/^[\w./-]+\.html$/.test(production.sourceFile) || production.sourceFile.includes(".."))
    throw Error("Multiplane shot must be an HTML file inside the project");
  emit("validation", "Checking the Multiplane shot: lint, stage size, duration and frame rate");
  const inspected = await runMultiplane(
    "inspect",
    multiplaneInspectArgs(production.sourceFile),
    job.workspace,
    signal,
    () => {},
    180000,
  );
  const problems = multiplaneShotProblems(inspected.data, {
    width: production.width,
    height: production.height,
    duration: job.duration,
    fps,
  });
  if (problems.length)
    throw Error(`Multiplane shot does not match the requested output: ${problems.join("; ")}`);
  emit("validation", "Checking that every frame depends only on time");
  await runMultiplane(
    "verify",
    multiplaneVerifyArgs(production.sourceFile, fps),
    job.workspace,
    signal,
  );
  emit("phase", "Rendering the Multiplane shot");
  await runMultiplane(
    "render",
    multiplaneRenderArgs({
      shot: production.sourceFile,
      output: path.relative(job.workspace, video),
      fps,
      kind: job.kind,
      audioFile: production.audioFile,
    }),
    job.workspace,
    signal,
    (text) => emit("render_progress", text),
  );
}
export async function renderJob(
  job: VideoGenerationJob,
  production: Production,
  signal: AbortSignal,
  emit: (type: string, message: string) => void,
  speechTrack?: SpeechTrack,
) {
  const fps = production.fps ?? 30;
  const out = path.join(job.workspace, "renders");
  await mkdir(out, { recursive: true });
  const video = path.join(out, job.kind === "preview" ? previewVideoFile : "full.mp4");
  const nativeWebm = production.pipeline === "Multiplane";
  const rendered =
    job.kind === "preview" && !nativeWebm ? path.join(out, "preview.render.mp4") : video;
  const poster = path.join(out, `${job.kind}.jpg`);
  if (production.pipeline === "HyperFrames")
    await renderHyperFrames(job, production, rendered, out, fps, signal, emit);
  else if (production.pipeline === "Multiplane")
    await renderMultiplane(job, production, rendered, fps, signal, emit);
  else await renderRemotion(job, production, rendered, fps, signal, emit);
  if (job.kind === "full" && speechTrack) {
    emit("phase", "Mixing voice and music…");
    await mixSpeech(rendered, speechTrack, job.duration, signal);
  }
  const probe = await probeVideo(rendered, signal);
  const picture = probe.streams.find((s) => s.codec_type === "video");
  if (
    !picture ||
    picture.codec_name !== (rendered.endsWith(".webm") ? "vp9" : "h264") ||
    picture.width !== production.width ||
    picture.height !== production.height ||
    Math.abs(Number(probe.format.duration) - job.duration) > 0.15 ||
    picture.avg_frame_rate !== `${fps}/1`
  )
    throw Error(
      "Rendered video dimensions, frame rate, or duration do not match the requested output",
    );
  if (job.kind === "preview" && probe.streams.some((s) => s.codec_type === "audio"))
    throw Error("Preview must be silent");
  if (rendered !== video) {
    emit("phase", "Converting the preview to WebM");
    await transcodePreviewToWebm(rendered, video, signal);
    await rm(rendered, { force: true });
  }
  await command("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"], job.workspace, signal);
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-ss",
      String(Math.min(job.duration / 2, 1.5)),
      "-i",
      video,
      "-frames:v",
      "1",
      poster,
    ],
    job.workspace,
    signal,
  );
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-i",
      video,
      "-vf",
      `fps=${6 / job.duration},scale=480:-1,tile=3x2`,
      "-frames:v",
      "1",
      path.join(out, "contact-sheet.jpg"),
    ],
    job.workspace,
    signal,
  );
  await writeFile(
    path.join(job.workspace, "VALIDATION.md"),
    `# Render validation\n\nVerified by the application: ${job.duration}s, ${production.width}×${production.height}, ${fps} fps; full video decode passed. ${job.kind === "preview" ? "No audio track (silent preview). The preview is a VP9 WebM, checked against the validated render for size, frame rate, duration, frame count and picture similarity." : "Audio presence is recorded in renders/validation.json."}\n\nInspect renders/contact-sheet.jpg and the decoded ${path.relative(job.workspace, video)} for appearance and movement. Agent-side limitations about pending rendering are superseded only for the checks listed here.\n\nReproduce with: ${production.pipeline === "Multiplane" ? `node_modules/.bin/multiplane render ${production.sourceFile} --fps ${fps} --out renders/output.${job.kind === "preview" ? "webm" : "mp4"}` : `node_modules/.bin/hyperframes render . --fps ${fps} --output renders/output.mp4`}\n`,
  );
  await writeFile(
    path.join(out, "validation.json"),
    JSON.stringify(
      { probe, production, mixedVoice: speechTrack, verifiedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  return {
    video: path.relative(job.workspace, video),
    poster: path.relative(job.workspace, poster),
  };
}
export async function makePlaybackCopies(
  job: VideoGenerationJob,
  signal: AbortSignal,
  emit: (type: string, message: string) => void,
): Promise<Pick<VideoGenerationJob, "viewingVideo" | "cardClip" | "playbackCopies">> {
  const status = (value: "ready" | "failed", error?: string) => ({
    profile: playbackCopyProfile,
    status: value,
    ...(error ? { error } : {}),
    updatedAt: new Date().toISOString(),
  });
  if (job.kind !== "full" || !job.video)
    return { playbackCopies: status("failed", "Only finished full films get playback copies") };
  const master = path.join(job.workspace, job.video);
  const renders = path.join(job.workspace, "renders");
  const made: Pick<VideoGenerationJob, "viewingVideo" | "cardClip"> = {};
  emit("phase", "Making the 720p viewing copy and card clip; the MP4 download is ready");
  try {
    let reported = 0;
    const view = await makeViewingWebm(
      master,
      path.join(renders, viewingVideoFile),
      signal,
      (fraction) => {
        const percent = Math.floor(fraction * 10) * 10;
        if (percent <= reported) return;
        reported = percent;
        emit("render_progress", `720p viewing copy ${percent}%`);
      },
    );
    made.viewingVideo = path.join("renders", viewingVideoFile);
    const scenes = await readStoryboardJson(job.workspace).then(
      (storyboard) => ("scenes" in storyboard ? storyboard.scenes : []),
      () => [],
    );
    const card = await makeCardClip(
      master,
      path.join(renders, cardClipFile),
      cardClipStart(job.duration, scenes),
      signal,
    );
    made.cardClip = path.join("renders", cardClipFile);
    emit(
      "validation",
      `720p viewing copy and card clip checked against the MP4 (similarity ${view.similarity.toFixed(3)} and ${card.similarity.toFixed(3)})`,
    );
    return { ...made, playbackCopies: status("ready") };
  } catch (error) {
    const message = signal.aborted ? "Stopped before it finished" : safeMessage(error);
    emit(
      "warning",
      `${made.viewingVideo ? "The card clip" : "The 720p viewing copy"} isn't ready (${message}); the MP4 plays instead.`,
    );
    return { ...made, playbackCopies: status("failed", message) };
  }
}
