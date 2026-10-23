import { pocketZhSpeechProvider } from "./pocket-tts-zh";
import { defaultPython } from "../../runtime/platform";
import { PocketTtsWorker } from "./pocket-worker";
import { stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pocketLanguageForVoice } from "../../../shared/speech";
import { CodedError } from "../../../shared/errors";
import { appRoot, dataRoot } from "../../runtime/config";
import { command } from "../../runtime/process";
import { WorkQueue } from "../../jobs/queue";
import { speechModelDirectory } from "./paths";
import { publishSpeechWave } from "./local-wave";
import type { SpeechProvider } from "./types";
const queue = new WorkQueue(1);
const modelDirectory = speechModelDirectory("pocket-tts");
const script = path.join(appRoot, "scripts/speech/pocket-tts.py");
const managedPython = path.join(
  dataRoot,
  "pocket-tts-venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const python = () =>
  process.env.POCKET_TTS_PYTHON || (existsSync(managedPython) ? managedPython : defaultPython());
let warm: { key: string; worker: PocketTtsWorker } | undefined;
export function stopPocketTtsWorker() {
  warm?.worker.stop();
  warm = undefined;
}
async function workerFor(language: string) {
  const [manifest, config, adapter] = await Promise.all([
    stat(path.join(modelDirectory, "languages", language, "ready.json")),
    stat(path.join(modelDirectory, "languages", language, "config.yaml")),
    stat(script),
  ]);
  const executable = python();
  const key = JSON.stringify({
    executable,
    language,
    modelDirectory,
    manifest: manifest.mtimeMs,
    config: config.mtimeMs,
    adapter: adapter.mtimeMs,
  });
  if (warm?.key !== key) {
    stopPocketTtsWorker();
    warm = {
      key,
      worker: new PocketTtsWorker(
        executable,
        [script, "--models", modelDirectory, "--language", language, "--serve"],
        appRoot,
      ),
    };
  }
  return warm!.worker;
}
export const pocketTtsSpeechProvider: SpeechProvider = {
  id: "pocket-tts",
  async readiness(signal, voice = "pocket_alba", selectedLanguage) {
    if (pocketLanguageForVoice(voice, selectedLanguage)?.id === "zh")
      return pocketZhSpeechProvider.readiness(signal, voice, "zh");
    const language = pocketLanguageForVoice(voice, selectedLanguage);
    if (!language) throw new CodedError("INVALID_REQUEST", "Choose a Pocket TTS voice.");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await command(
          python(),
          [script, "--models", modelDirectory, "--language", language.model, "--check"],
          appRoot,
          signal,
          () => {},
          15000,
        );
        return { available: true, detail: "Local narration · Pocket TTS. No provider credits." };
      } catch {
        signal.throwIfAborted();
      }
    }
    return {
      available: false,
      detail: `Pocket TTS ${language.label} needs setup. Run npm run speech:setup:pocket -- --language ${language.model} or see docs/speech.md.`,
    };
  },
  async synthesize(text, file, voice, speed, signal, selectedLanguage) {
    if (pocketLanguageForVoice(voice, selectedLanguage)?.id === "zh")
      return pocketZhSpeechProvider.synthesize(text, file, voice, speed, signal, "zh");
    return queue.run(async () => {
      signal.throwIfAborted();
      const language = pocketLanguageForVoice(voice, selectedLanguage);
      if (!language) throw new CodedError("INVALID_REQUEST", "Choose a Pocket TTS voice.");
      const ready = await pocketTtsSpeechProvider.readiness(signal, voice, selectedLanguage);
      if (!ready.available) throw new CodedError("SPEECH_NOT_READY", ready.detail);
      return publishSpeechWave({
        text,
        file,
        signal,
        tempo: speed,
        generate: async (textFile, output) => {
          const worker = await workerFor(language.model);
          await worker.synthesize(
            { textFile, output, voice: voice.slice("pocket_".length) },
            signal,
          );
        },
      });
    });
  },
};
