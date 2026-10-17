import { randomUUID } from "node:crypto";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { command } from "../runtime/process";
import { probeVideo } from "../rendering/video-probe";

export const narrationAudioRevision = 2;
const MeasurementSchema = z.object({ input_i: z.string() });

/** Match perceived voice level, then apply the listener's gain with peak protection. */
export async function matchNarrationLevel(
  input: string,
  output: string,
  volume: number,
  signal: AbortSignal,
): Promise<number> {
  z.number().min(0).max(2).parse(volume);
  const folder = path.dirname(output);
  const temporary = `${output}.${randomUUID()}.wav`;
  try {
    const measurement = await command(
      "ffmpeg",
      [
        "-hide_banner",
        "-i",
        input,
        "-af",
        "loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json",
        "-f",
        "null",
        "-",
      ],
      folder,
      signal,
    );
    const json = measurement.match(/\{[^{}]*"input_i"[^{}]*\}/)?.[0];
    if (!json) throw Error("Could not measure narration loudness.");
    const measured = MeasurementSchema.parse(JSON.parse(json)).input_i;
    const loudness = Number(measured);
    if (!Number.isFinite(loudness) && measured !== "-inf")
      throw Error("Invalid narration loudness measurement.");
    // Silence stays silent. A fixed gain preserves the voice's natural dynamics.
    const gain = measured === "-inf" ? 0 : 10 ** ((-18 - loudness) / 20) * volume;
    await command(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        input,
        "-af",
        `volume=${gain},aresample=192000,alimiter=limit=0.841395:level=false:latency=true,aresample=48000`,
        "-c:a",
        "pcm_s24le",
        temporary,
      ],
      folder,
      signal,
    );
    const probe = await probeVideo(temporary, signal);
    const duration = Number(probe.format.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw Error("Invalid narration duration.");
    signal.throwIfAborted();
    await rename(temporary, output);
    return duration;
  } finally {
    await rm(temporary, { force: true });
  }
}
