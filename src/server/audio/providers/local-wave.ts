import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { probeVideo } from "../../rendering/video-probe";
import { command } from "../../runtime/process";
import { CodedError } from "../../../shared/errors";

/** Publish only complete, valid audio; both local engines share cancellation and cleanup. */
export async function publishSpeechWave(input: {
  text: string;
  file: string;
  signal: AbortSignal;
  tempo?: number;
  generate: (script: string, output: string) => Promise<void>;
}) {
  const { text, file, signal, generate, tempo = 1 } = input;
  signal.throwIfAborted();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.wav`;
  const natural = `${temporary}.natural.wav`;
  const script = `${temporary}.txt`;
  try {
    await writeFile(script, text);
    await generate(script, tempo === 1 ? temporary : natural);
    if (tempo !== 1)
      await command(
        "ffmpeg",
        ["-v", "error", "-y", "-i", natural, "-af", `atempo=${tempo}`, temporary],
        path.dirname(file),
        signal,
      );
    const probe = await probeVideo(temporary, signal);
    const seconds = Number(probe.format.duration);
    if (
      !probe.streams.some((stream) => stream.codec_type === "audio") ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    )
      throw Error("Speech synthesis returned no valid audio or duration.");
    signal.throwIfAborted();
    await rename(temporary, file);
    return seconds;
  } catch (error) {
    signal.throwIfAborted();
    throw new CodedError("SPEECH_FAILED", `Voice synthesis failed: ${(error as Error).message}`);
  } finally {
    await Promise.all([script, temporary, natural].map((file) => rm(file, { force: true })));
  }
}
