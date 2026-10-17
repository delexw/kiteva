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
  process.env.POCKET_TTS_PYTHON || (existsSync(managedPython) ? managedPython : "python3");
export const pocketTtsSpeechProvider: SpeechProvider = {
  id: "pocket-tts",
  async readiness(signal, voice = "pocket_alba", selectedLanguage) {
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
          await command(
            python(),
            [
              script,
              "--models",
              modelDirectory,
              "--language",
              language.model,
              "--text-file",
              textFile,
              "--voice",
              voice.slice("pocket_".length),
              "--output",
              output,
            ],
            appRoot,
            signal,
            () => {},
            300000,
          );
        },
      });
    });
  },
};
