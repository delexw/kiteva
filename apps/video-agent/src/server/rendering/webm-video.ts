import path from "node:path";
import { rename, rm, stat } from "node:fs/promises";
import { command } from "../runtime/process.js";
import { probeVideo, type VideoProbe } from "./video-probe";

export const previewVideoFile = "preview.webm";
export const minimumWebmSimilarity = 0.94;

export function videoMimeType(file: string) {
  return path.extname(file).toLowerCase() === ".webm" ? "video/webm" : "video/mp4";
}
export function frameRateOf(probe: VideoProbe) {
  const rate = probe.streams.find((stream) => stream.codec_type === "video")?.avg_frame_rate;
  const [numerator, denominator = "1"] = (rate || "").split("/");
  const fps = Number(numerator) / Number(denominator);
  if (!Number.isFinite(fps) || fps <= 0) throw Error("Source video has no readable frame rate");
  return fps;
}
export function previewWebmArgs(source: string, target: string, fps: number) {
  return [
    "-y",
    "-v",
    "error",
    "-i",
    source,
    "-map",
    "0:v:0",
    "-an",
    "-sn",
    "-dn",
    "-map_metadata",
    "-1",
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "18",
    "-b:v",
    "0",
    "-deadline",
    "good",
    "-cpu-used",
    "2",
    "-row-mt",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-g",
    String(Math.round(fps)),
    "-f",
    "webm",
    target,
  ];
}
export type WebmTarget = {
  width: number;
  height: number;
  frameRate: string;
  frames: number;
  frameTolerance: number;
};
export function webmProblems(
  target: WebmTarget,
  webm: VideoProbe,
  similarity: number,
  streamProblems: () => string[],
) {
  const to = webm.streams.find((stream) => stream.codec_type === "video");
  if (!to) return ["WebM has no video stream"];
  const problems: string[] = [];
  if (to.codec_name !== "vp9") problems.push(`codec is ${to.codec_name}, not vp9`);
  if (to.width !== target.width || to.height !== target.height)
    problems.push(`size ${to.width}×${to.height} differs from ${target.width}×${target.height}`);
  if (to.avg_frame_rate !== target.frameRate)
    problems.push(`frame rate ${to.avg_frame_rate} differs from ${target.frameRate}`);
  if (!(Math.abs(Number(to.nb_read_frames) - target.frames) <= target.frameTolerance))
    problems.push(`frame count ${to.nb_read_frames} differs from ${target.frames}`);
  problems.push(...streamProblems());
  if (!(similarity >= minimumWebmSimilarity))
    problems.push(`picture similarity ${similarity} is below ${minimumWebmSimilarity}`);
  return problems;
}
export function previewWebmProblems(source: VideoProbe, webm: VideoProbe, similarity: number) {
  const from = source.streams.find((stream) => stream.codec_type === "video");
  if (!from) return ["source has no video stream"];
  const target = {
    width: from.width,
    height: from.height,
    frameRate: from.avg_frame_rate,
    frames: Number(from.nb_read_frames),
    frameTolerance: 0,
  };
  return webmProblems(target, webm, similarity, () => [
    ...(Math.abs(Number(webm.format.duration) - Number(source.format.duration)) >
    1 / frameRateOf(source)
      ? [`duration ${webm.format.duration}s differs from ${source.format.duration}s`]
      : []),
    ...(webm.streams.some((stream) => stream.codec_type === "audio")
      ? ["WebM preview has an audio track"]
      : []),
  ]);
}
export async function countedProbe(file: string, signal: AbortSignal, timeout = 180000) {
  const probe = await probeVideo(file, signal);
  const counted = JSON.parse(
    await command(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=nb_read_frames",
        "-of",
        "json",
        file,
      ],
      path.dirname(file),
      signal,
      () => {},
      timeout,
    ),
  ) as { streams: Array<{ nb_read_frames?: string }> };
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  if (video) video.nb_read_frames = counted.streams[0]?.nb_read_frames;
  return probe;
}
export async function similarityOf(
  webm: string,
  source: string,
  signal: AbortSignal,
  timeout = 600000,
  reference: { input: string[]; filter: string } = { input: [], filter: "" },
) {
  const output = await command(
    "ffmpeg",
    [
      "-v",
      "info",
      "-i",
      webm,
      ...reference.input,
      "-i",
      source,
      "-lavfi",
      reference.filter
        ? `[1:v]${reference.filter}[reference];[0:v][reference]ssim`
        : "[0:v][1:v]ssim",
      "-f",
      "null",
      "-",
    ],
    path.dirname(webm),
    signal,
    () => {},
    timeout,
  );
  return Number(/All:([0-9.]+)/.exec(output)?.[1]);
}
export function decodeWebm(webm: string, signal: AbortSignal, timeout = 180000) {
  return command(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", webm, "-f", "null", "-"],
    path.dirname(webm),
    signal,
    () => {},
    timeout,
  );
}
export async function verifyPreviewWebm(source: string, webm: string, signal: AbortSignal) {
  await decodeWebm(webm, signal);
  const [sourceProbe, webmProbe, similarity] = [
    await countedProbe(source, signal),
    await countedProbe(webm, signal),
    await similarityOf(webm, source, signal),
  ];
  return {
    problems: previewWebmProblems(sourceProbe, webmProbe, similarity),
    similarity,
    probe: webmProbe,
  };
}
export async function writeVerifiedWebm(
  target: string,
  label: string,
  encode: (partial: string) => Promise<unknown>,
  verify: (partial: string) => Promise<{ problems: string[]; similarity: number }>,
) {
  const partial = `${target}.partial`;
  try {
    await encode(partial);
    const result = await verify(partial);
    if (result.problems.length)
      throw Error(`${label} failed verification: ${result.problems.join("; ")}`);
    await rename(partial, target);
    return { similarity: result.similarity, bytes: (await stat(target)).size };
  } finally {
    await rm(partial, { force: true });
  }
}
export async function transcodePreviewToWebm(source: string, target: string, signal: AbortSignal) {
  const fps = frameRateOf(await probeVideo(source, signal));
  return writeVerifiedWebm(
    target,
    "Preview WebM",
    (partial) =>
      command(
        "ffmpeg",
        previewWebmArgs(source, partial, fps),
        path.dirname(target),
        signal,
        () => {},
        600000,
      ),
    (partial) => verifyPreviewWebm(source, partial, signal),
  );
}
