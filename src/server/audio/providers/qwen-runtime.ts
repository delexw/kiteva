import { RetryBudget } from "../../../shared/retry-budget";
import { existsSync } from "node:fs";
import path from "node:path";
import { speechLanguage } from "../../../shared/speech";
import { CodedError } from "../../../shared/errors";
import { WorkQueue } from "../../jobs/queue";
import { appRoot, dataRoot } from "../../runtime/config";
import { defaultPython } from "../../runtime/platform";
import { command } from "../../runtime/process";
import { publishSpeechWave } from "./local-wave";
import type { SpeechProvider } from "./types";

const managedPython = path.join(dataRoot, "qwen3-tts-venv", "bin/python");
export const qwenPython = () =>
  process.env.QWEN_TTS_PYTHON || (existsSync(managedPython) ? managedPython : defaultPython());
const queue = new WorkQueue(1);

export function createQwenSpeechProvider(options: {
  id: SpeechProvider["id"];
  label: string;
  setupCommand: string;
  voices: readonly { id: string }[];
  runtimeArguments: () => string[];
}): SpeechProvider {
  function validateSelection(voice: string, language?: string) {
    if (
      !options.voices.some((item) => item.id === voice) ||
      (language && !["en", "zh"].includes(language))
    )
      throw new CodedError(
        "INVALID_REQUEST",
        "Choose a Qwen3-TTS voice and Chinese or English narration.",
      );
  }

  const provider: SpeechProvider = {
    id: options.id,
    async readiness(signal, voice = options.voices[0].id, language) {
      signal.throwIfAborted();
      validateSelection(voice, language);
      if (process.platform !== "darwin" || process.arch !== "arm64")
        return {
          available: false,
          detail: "Local Qwen3-TTS currently requires an Apple Silicon Mac.",
        };
      let diagnostic = "";
      for (const _attempt of new RetryBudget(2)) {
        try {
          await command(
            qwenPython(),
            [...options.runtimeArguments(), "--check", "--voice", voice],
            appRoot,
            signal,
            () => {},
            15000,
          );
          return {
            available: true,
            detail: `Local narration · ${options.label}. No provider credits.`,
          };
        } catch (error) {
          signal.throwIfAborted();
          diagnostic = (error as Error).message;
        }
      }
      return {
        available: false,
        detail: `Qwen3-TTS is unavailable: ${diagnostic}. Run npm run ${options.setupCommand} or see docs/speech.md.`,
      };
    },
    async synthesize(text, file, voice, speed, signal, language) {
      validateSelection(voice, language);
      return queue.run(async () => {
        signal.throwIfAborted();
        const ready = await provider.readiness(signal, voice, language);
        if (!ready.available) throw new CodedError("SPEECH_NOT_READY", ready.detail);
        return publishSpeechWave({
          text,
          file,
          signal,
          tempo: speed,
          generate: async (script, output) => {
            await command(
              qwenPython(),
              [
                ...options.runtimeArguments(),
                "--text-file",
                script,
                "--output",
                output,
                "--voice",
                voice,
                "--language",
                speechLanguage(voice, options.id, language)!,
              ],
              path.dirname(file),
              signal,
              () => {},
              300000,
            );
          },
        });
      }, signal);
    },
  };

  return provider;
}
