import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { speechVoices, type SpeechReadiness } from "../../../shared/speech";
import { appRoot, dataRoot } from "../../runtime/config";
import { command } from "../../runtime/process";
import { probeVideo } from "../../rendering/video-probe";
import { WorkQueue } from "../../jobs/queue";
import { CodedError } from "../../../shared/errors";
import type { SpeechProvider } from "./types";
import { speechModelDirectory } from "./paths";

const modelDirectory = speechModelDirectory("kokoro");
const synthesisQueue = new WorkQueue(1);
const managedPython = path.join(
  dataRoot,
  "speech-venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const python = () =>
  process.env.HYPERFRAMES_PYTHON || (existsSync(managedPython) ? managedPython : "python3");

async function speechReadiness(signal: AbortSignal): Promise<SpeechReadiness> {
  const checks = async () => {
    await command(
      python(),
      ["-c", "import kokoro_onnx, soundfile; print('ready')"],
      appRoot,
      signal,
      () => {},
      15000,
    );

    await Promise.all([
      access(path.join(appRoot, "scripts/speech/kokoro.py")),
      access(path.join(modelDirectory, "kokoro-v1.0.onnx")),
      access(path.join(modelDirectory, "voices-v1.0.bin")),
    ]);
  };
  // Retry transient interpreter/cache errors before declaring the runtime unavailable.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await checks();
      return { available: true, detail: "Local narration · Kokoro. No provider credits." };
    } catch {
      signal.throwIfAborted();
    }
  }
  return {
    available: false,
    detail:
      "Local speech needs setup. Run npm run speech:setup or see docs/speech.md. Uploaded vocals still work.",
  };
}

async function synthesizeSpeech(
  text: string,
  file: string,
  voice: string,
  speed: number,
  signal: AbortSignal,
) {
  return synthesisQueue.run(async () => {
    signal.throwIfAborted();
    const ready = await speechReadiness(signal);
    if (!ready.available) throw new CodedError("SPEECH_NOT_READY", ready.detail);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.wav`;
    const script = `${temporary}.txt`;
    await writeFile(script, text);
    try {
      await command(
        python(),
        [
          path.join(appRoot, "scripts/speech/kokoro.py"),
          "--model",
          path.join(modelDirectory, "kokoro-v1.0.onnx"),
          "--voices",
          path.join(modelDirectory, "voices-v1.0.bin"),
          "--text-file",
          script,
          "--voice",
          voice,
          "--language",
          speechVoices.find((item) => item.id === voice)?.language || "en-us",
          "--speed",
          String(speed),
          "--output",
          temporary,
        ],
        path.dirname(file),
        signal,
        () => {},
        300000,
      );
      const probe = await probeVideo(temporary, signal);
      if (!probe.streams.some((stream) => stream.codec_type === "audio"))
        throw Error("Speech synthesis returned no audio.");
      signal.throwIfAborted();
      await rename(temporary, file);
      return Number(probe.format.duration);
    } catch (error) {
      signal.throwIfAborted();
      throw new CodedError("SPEECH_FAILED", `Voice synthesis failed: ${(error as Error).message}`);
    } finally {
      await rm(script, { force: true });
      await rm(temporary, { force: true });
    }
  });
}

export const kokoroSpeechProvider: SpeechProvider = {
  id: "kokoro",
  readiness: speechReadiness,
  synthesize: synthesizeSpeech,
};
