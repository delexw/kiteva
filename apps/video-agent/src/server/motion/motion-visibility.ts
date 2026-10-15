import path from "node:path";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import sharp from "sharp";
import { command } from "../runtime/process";

// Ignore small compression differences; count a pixel only when a channel changes substantially.
export function visiblePixelChange(first: Uint8Array, second: Uint8Array): number {
  if (first.length !== second.length || first.length === 0 || first.length % 3 !== 0)
    throw Error("Motion comparison requires matching RGB frames");
  let changed = 0;
  for (let i = 0; i < first.length; i += 3) {
    if (
      Math.max(
        Math.abs(first[i] - second[i]),
        Math.abs(first[i + 1] - second[i + 1]),
        Math.abs(first[i + 2] - second[i + 2]),
      ) >= 32
    )
      changed++;
  }
  return changed / (first.length / 3);
}
export async function verifyVisibleMotion(video: string, signal: AbortSignal): Promise<number> {
  const folder = await mkdtemp(path.join(path.dirname(video), "motion-check-"));
  try {
    await command(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        video,
        "-vf",
        "fps=4,scale=320:180",
        "-frames:v",
        "12",
        path.join(folder, "%02d.png"),
      ],
      folder,
      signal,
    );
    const frames = (await readdir(folder)).filter((file) => file.endsWith(".png")).sort();
    if (frames.length < 10) throw Error("Motion check could not decode enough frames");
    const pixels = await Promise.all(
      frames.map((file) =>
        sharp(path.join(folder, file)).removeAlpha().toColourspace("srgb").raw().toBuffer(),
      ),
    );
    const change = Math.max(
      ...pixels.slice(0, -1).map((frame) => visiblePixelChange(frame, pixels[pixels.length - 1])),
    );
    if (change < 0.02)
      throw Error(
        `Motion is too subtle at card size: ${(change * 100).toFixed(2)}% changed pixels; require at least 2%. Replan substantial illustrative objects with readable reveals, drawing or stronger bounded motion.`,
      );
    return change;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
