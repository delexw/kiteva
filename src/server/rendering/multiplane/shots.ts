import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { Production } from "../../../shared/agents/schemas/video";
import { command } from "../../runtime/process";
import { videoRenderTimeoutMs } from "../timeouts";

export function multiplaneShotPlan(production: Production, duration: number, fps: number) {
  const shots = production.shots ?? [{ sourceFile: production.sourceFile, duration }];
  if (shots.length === 0 || shots[0]!.sourceFile !== production.sourceFile)
    throw Error("Multiplane sourceFile must identify the first shot");
  let frames = 0;
  for (const shot of shots) {
    if (
      !/^[\w./-]+\.html$/.test(shot.sourceFile) ||
      shot.sourceFile.includes("..") ||
      path.isAbsolute(shot.sourceFile)
    )
      throw Error("Multiplane shot must be an HTML file inside the project");
    const count = shot.duration * fps;
    if (!Number.isFinite(count) || count <= 0 || Math.abs(count - Math.round(count)) > 1e-6)
      throw Error(`Multiplane shot duration must align to output frames: ${shot.sourceFile}`);
    frames += Math.round(count);
  }
  if (Math.abs(duration * fps - frames) > 1e-6)
    throw Error("Multiplane shot durations must sum to the requested film duration");
  return shots;
}

export async function assembleMultiplaneShots(input: {
  directory: string;
  parts: string[];
  output: string;
  duration: number;
  audioFile?: string | null;
  signal: AbortSignal;
}) {
  // Only app-generated part names enter FFmpeg's concat-file syntax.
  if (!input.parts.length || input.parts.some((part) => !/^shot-\d+\.(mp4|webm)$/.test(part)))
    throw Error("Invalid Multiplane render part names");
  const list = path.join(input.directory, "shots.ffconcat");
  await writeFile(list, input.parts.map((part) => `file '${part}'`).join("\n") + "\n");
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "concat",
      "-safe",
      "1",
      "-i",
      list,
      ...(input.audioFile ? ["-i", input.audioFile] : []),
      "-map",
      "0:v:0",
      "-c:v",
      "copy",
      ...(input.audioFile
        ? ["-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-af", "apad"]
        : ["-an"]),
      "-t",
      String(input.duration),
      ...(input.output.endsWith(".mp4") ? ["-movflags", "+faststart"] : []),
      input.output,
    ],
    input.directory,
    input.signal,
    () => {},
    videoRenderTimeoutMs,
  );
}
