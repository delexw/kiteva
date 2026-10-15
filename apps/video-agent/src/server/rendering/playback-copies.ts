import path from "node:path";
import { command } from "../runtime/process.js";
import { probeVideo, type VideoProbe } from "./video-probe";
import {
  countedProbe,
  decodeWebm,
  frameRateOf,
  similarityOf,
  webmProblems,
  writeVerifiedWebm,
  type WebmTarget,
} from "./webm-video";

export const playbackCopyProfile = "view-720p30-opus128-card3s-v1";
export const viewingVideoFile = "view-720p30.webm";
export const cardClipFile = "card-3s.webm";
export const playbackShortSide = 720;
export const playbackMaxFps = 30;
export const cardClipSeconds = 3;
export const viewingAudioBitrate = "128k";
export const maximumAudioDrift = 0.025;

export type StreamSpan = { start: number; end: number };
export type MediaSpans = { video?: StreamSpan; audio?: StreamSpan };
export type PlaybackShape = { width: number; height: number; frameRate: string; fps: number };

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
export function playbackShape(source: VideoProbe): PlaybackShape {
  const video = source.streams.find((stream) => stream.codec_type === "video");
  if (!video) throw Error("Source video has no video stream");
  const scale = Math.min(1, playbackShortSide / Math.min(video.width, video.height));
  const sourceFps = frameRateOf(source);
  return {
    width: scale < 1 ? even(video.width * scale) : video.width,
    height: scale < 1 ? even(video.height * scale) : video.height,
    ...(sourceFps > playbackMaxFps
      ? { frameRate: `${playbackMaxFps}/1`, fps: playbackMaxFps }
      : { frameRate: video.avg_frame_rate, fps: sourceFps }),
  };
}
export function playbackFilter(source: VideoProbe, shape: PlaybackShape) {
  const video = source.streams.find((stream) => stream.codec_type === "video")!;
  const filters = [
    ...(shape.frameRate !== video.avg_frame_rate ? [`fps=${shape.frameRate}`] : []),
    ...(shape.width !== video.width || shape.height !== video.height
      ? [`scale=${shape.width}:${shape.height}:flags=lanczos`]
      : []),
  ];
  return filters.join(",") || "null";
}
const vp9Args = (fps: number) => [
  "-c:v",
  "libvpx-vp9",
  "-crf",
  "33",
  "-b:v",
  "0",
  "-deadline",
  "good",
  "-cpu-used",
  "4",
  "-row-mt",
  "1",
  "-tile-columns",
  "2",
  "-pix_fmt",
  "yuv420p",
  "-g",
  String(Math.round(fps)),
];
export function viewingWebmArgs(
  source: string,
  target: string,
  filter: string,
  fps: number,
  audioChannels: number,
) {
  return [
    "-y",
    "-v",
    "error",
    "-nostats",
    "-progress",
    "pipe:1",
    "-i",
    source,
    "-map",
    "0:v:0",
    ...(audioChannels ? ["-map", "0:a:0"] : ["-an"]),
    "-sn",
    "-dn",
    "-map_metadata",
    "-1",
    "-vf",
    filter,
    ...vp9Args(fps),
    ...(audioChannels
      ? ["-c:a", "libopus", "-b:a", viewingAudioBitrate, "-ac", String(audioChannels)]
      : []),
    "-f",
    "webm",
    target,
  ];
}
export function cardClipArgs(
  source: string,
  target: string,
  start: number,
  seconds: number,
  filter: string,
  fps: number,
) {
  return [
    "-y",
    "-v",
    "error",
    "-ss",
    start.toFixed(3),
    "-t",
    seconds.toFixed(3),
    "-i",
    source,
    "-map",
    "0:v:0",
    "-an",
    "-sn",
    "-dn",
    "-map_metadata",
    "-1",
    "-vf",
    filter,
    ...vp9Args(fps),
    "-f",
    "webm",
    target,
  ];
}
export function cardClipStart(
  duration: number,
  scenes: Array<{ startSeconds: number; endSeconds: number }>,
) {
  const latest = Math.max(0, duration - cardClipSeconds);
  const focus = duration * 0.3;
  const scene = scenes.find((item) => item.startSeconds <= focus && focus < item.endSeconds);
  const start =
    scene && scene.endSeconds - scene.startSeconds >= cardClipSeconds + 0.5
      ? scene.startSeconds + 0.5
      : focus;
  return Math.round(Math.min(latest, Math.max(0, start)) * 1000) / 1000;
}
export function audioChannelsFor(source: VideoProbe) {
  const audio = source.streams.find((stream) => stream.codec_type === "audio");
  return audio ? Math.min(2, audio.channels || 2) : 0;
}
export function viewingWebmProblems(
  source: VideoProbe,
  webm: VideoProbe,
  similarity: number,
  sourceSpans: MediaSpans,
  webmSpans: MediaSpans,
) {
  const shape = playbackShape(source);
  const sourceVideo = source.streams.find((stream) => stream.codec_type === "video")!;
  const target: WebmTarget = {
    width: shape.width,
    height: shape.height,
    frameRate: shape.frameRate,
    frames: Math.round((Number(sourceVideo.nb_read_frames) * shape.fps) / frameRateOf(source)),
    frameTolerance: 1,
  };
  return webmProblems(target, webm, similarity, () => {
    const problems: string[] = [];
    const frameLength = 1 / shape.fps;
    const [from, to] = [sourceSpans.video, webmSpans.video];
    if (!from || !to) problems.push("video timing could not be read");
    else if (
      Math.abs(to.start - from.start) > frameLength ||
      Math.abs(to.end - from.end) > frameLength
    )
      problems.push(`video runs ${to.start}–${to.end}s instead of ${from.start}–${from.end}s`);
    const channels = audioChannelsFor(source);
    const webmAudio = webm.streams.filter((stream) => stream.codec_type === "audio");
    if (!channels) {
      if (webmAudio.length) problems.push("WebM has an audio track the MP4 does not have");
      return problems;
    }
    if (webmAudio.length !== 1) {
      problems.push(`WebM has ${webmAudio.length} audio tracks instead of 1`);
      return problems;
    }
    if (webmAudio[0].codec_name !== "opus")
      problems.push(`audio codec is ${webmAudio[0].codec_name}, not opus`);
    if (webmAudio[0].channels !== channels)
      problems.push(`audio has ${webmAudio[0].channels} channels instead of ${channels}`);
    const [heard, expected] = [webmSpans.audio, sourceSpans.audio];
    if (!heard || !expected) problems.push("audio timing could not be read");
    else if (
      Math.abs(heard.start - expected.start) > maximumAudioDrift ||
      Math.abs(heard.end - expected.end) > maximumAudioDrift
    )
      problems.push(
        `audio runs ${heard.start}–${heard.end}s instead of ${expected.start}–${expected.end}s`,
      );
    return problems;
  });
}
export function cardClipProblems(
  source: VideoProbe,
  webm: VideoProbe,
  similarity: number,
  span: StreamSpan | undefined,
  seconds: number,
) {
  const shape = playbackShape(source);
  const target: WebmTarget = {
    width: shape.width,
    height: shape.height,
    frameRate: shape.frameRate,
    frames: Math.round(seconds * shape.fps),
    frameTolerance: 1,
  };
  return webmProblems(target, webm, similarity, () => [
    ...(!span || Math.abs(span.end - span.start - seconds) > 1 / shape.fps
      ? [`card clip lasts ${span ? span.end - span.start : "?"}s instead of ${seconds}s`]
      : []),
    ...(webm.streams.some((stream) => stream.codec_type === "audio")
      ? ["card clip has an audio track"]
      : []),
  ]);
}
async function streamSpan(file: string, stream: "v:0" | "a:0", signal: AbortSignal) {
  let text = "";
  await command(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      stream,
      "-show_entries",
      "packet=pts_time,duration_time",
      "-of",
      "csv=p=0",
      file,
    ],
    path.dirname(file),
    signal,
    () => {},
    180000,
    false,
    (chunk) => {
      text += chunk;
    },
  );
  let span: StreamSpan | undefined;
  for (const line of text.split("\n")) {
    const [pts, duration] = line.split(",").map(Number);
    if (!Number.isFinite(pts)) continue;
    const end = pts + (Number.isFinite(duration) ? duration : 0);
    span = span
      ? { start: Math.min(span.start, pts), end: Math.max(span.end, end) }
      : { start: pts, end };
  }
  return span;
}
async function mediaSpans(file: string, signal: AbortSignal): Promise<MediaSpans> {
  return {
    video: await streamSpan(file, "v:0", signal),
    audio: await streamSpan(file, "a:0", signal),
  };
}
const workTimeout = (seconds: number) => Math.max(600000, Math.ceil(seconds) * 6000);
export function encodedFrames(progress: string) {
  const frames = [...progress.matchAll(/^frame=(\d+)$/gm)].map((match) => Number(match[1]));
  return frames.length ? Math.max(...frames) : undefined;
}
export async function verifyViewingWebm(source: string, webm: string, signal: AbortSignal) {
  const sourceProbe = await countedProbe(
    source,
    signal,
    workTimeout(Number((await probeVideo(source, signal)).format.duration)),
  );
  const timeout = workTimeout(Number(sourceProbe.format.duration));
  await decodeWebm(webm, signal, timeout);
  const [webmProbe, similarity, sourceSpans, webmSpans] = [
    await countedProbe(webm, signal, timeout),
    await similarityOf(webm, source, signal, timeout, {
      input: [],
      filter: playbackFilter(sourceProbe, playbackShape(sourceProbe)),
    }),
    await mediaSpans(source, signal),
    await mediaSpans(webm, signal),
  ];
  return {
    problems: viewingWebmProblems(sourceProbe, webmProbe, similarity, sourceSpans, webmSpans),
    similarity,
    probe: webmProbe,
    spans: webmSpans,
  };
}
export async function makeViewingWebm(
  source: string,
  target: string,
  signal: AbortSignal,
  onProgress: (fraction: number) => void = () => {},
) {
  const probe = await probeVideo(source, signal);
  const shape = playbackShape(probe);
  const seconds = Number(probe.format.duration);
  const totalFrames = Math.max(1, Math.round(seconds * shape.fps));
  let pending = "";
  let reported = 0;
  return writeVerifiedWebm(
    target,
    "720p viewing copy",
    (partial) =>
      command(
        "ffmpeg",
        viewingWebmArgs(
          source,
          partial,
          playbackFilter(probe, shape),
          shape.fps,
          audioChannelsFor(probe),
        ),
        path.dirname(target),
        signal,
        () => {},
        workTimeout(seconds),
        false,
        (chunk) => {
          const lines = (pending + chunk).split("\n");
          pending = lines.pop() || "";
          const frames = encodedFrames(lines.join("\n"));
          if (frames === undefined || frames <= reported) return;
          reported = frames;
          onProgress(Math.min(1, frames / totalFrames));
        },
      ),
    (partial) => verifyViewingWebm(source, partial, signal),
  );
}
export async function verifyCardClip(
  source: string,
  webm: string,
  start: number,
  seconds: number,
  signal: AbortSignal,
) {
  const sourceProbe = await probeVideo(source, signal);
  await decodeWebm(webm, signal);
  const webmProbe = await countedProbe(webm, signal);
  const similarity = await similarityOf(webm, source, signal, 600000, {
    input: ["-ss", start.toFixed(3), "-t", seconds.toFixed(3)],
    filter: playbackFilter(sourceProbe, playbackShape(sourceProbe)),
  });
  const span = (await mediaSpans(webm, signal)).video;
  return {
    problems: cardClipProblems(sourceProbe, webmProbe, similarity, span, seconds),
    similarity,
    probe: webmProbe,
  };
}
export async function makeCardClip(
  source: string,
  target: string,
  start: number,
  signal: AbortSignal,
) {
  const probe = await probeVideo(source, signal);
  const shape = playbackShape(probe);
  const seconds = Math.min(cardClipSeconds, Number(probe.format.duration) - start);
  return writeVerifiedWebm(
    target,
    "Card clip",
    (partial) =>
      command(
        "ffmpeg",
        cardClipArgs(source, partial, start, seconds, playbackFilter(probe, shape), shape.fps),
        path.dirname(target),
        signal,
        () => {},
        600000,
      ),
    (partial) => verifyCardClip(source, partial, start, seconds, signal),
  );
}
