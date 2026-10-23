import { mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { command } from "../runtime/process";

const SceneSchema = z.object({
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
});
const maximumFrames = 12;

/** Cover scene openings and developed states without treating samples as full playback. */
export function reviewFrameTimes(duration: number, storyboard: unknown) {
  if (!Number.isFinite(duration) || duration <= 0) throw Error("Invalid review duration");
  const parsed = z.object({ scenes: z.array(SceneSchema) }).safeParse(storyboard);
  const scenes = parsed.success
    ? parsed.data.scenes
        .filter((scene) => scene.startSeconds < scene.endSeconds && scene.startSeconds < duration)
        .map((scene) => ({
          startSeconds: scene.startSeconds,
          endSeconds: Math.min(scene.endSeconds, duration),
        }))
        .sort((a, b) => a.startSeconds - b.startSeconds)
    : [];
  const selected =
    scenes.length > maximumFrames / 2
      ? Array.from(
          { length: maximumFrames / 2 },
          (_, index) => scenes[Math.round((index * (scenes.length - 1)) / (maximumFrames / 2 - 1))],
        )
      : scenes;
  const times = selected.length
    ? selected.flatMap((scene) => {
        const span = scene.endSeconds - scene.startSeconds;
        return [scene.startSeconds + Math.min(0.5, span * 0.1), scene.startSeconds + span * 0.6];
      })
    : Array.from({ length: 6 }, (_, index) => (duration * (index + 0.5)) / 6);
  return [...new Set(times.map((time) => Math.max(0, Math.min(time, duration - 0.001))))].sort(
    (a, b) => a - b,
  );
}

export async function prepareReviewFrames(input: {
  workspace: string;
  videoPath: string;
  duration: number;
  storyboard: unknown;
  signal: AbortSignal;
}) {
  const workspace = await realpath(input.workspace);
  const video = await realpath(path.resolve(workspace, input.videoPath));
  const relative = path.relative(workspace, video);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative))
    throw Error("Review video must belong to this job workspace");
  const directory = path.join(workspace, "renders", "result-review-frames");
  await mkdir(directory, { recursive: true });
  const frames = [];
  for (const [index, timestamp] of reviewFrameTimes(input.duration, input.storyboard).entries()) {
    input.signal.throwIfAborted();
    const file = path.join(directory, `frame-${index}.png`);
    await command(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-ss",
        String(timestamp),
        "-i",
        video,
        "-frames:v",
        "1",
        "-vf",
        "scale=1920:1920:force_original_aspect_ratio=decrease",
        "-threads",
        "1",
        file,
      ],
      workspace,
      input.signal,
      undefined,
      15000,
    );
    if (!(await stat(file)).size) throw Error("Review frame is empty");
    frames.push({ timestamp, path: file });
  }
  return frames;
}
