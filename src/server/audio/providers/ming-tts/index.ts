import path from "node:path";
import { existsSync } from "node:fs";
import catalog from "../../../../shared/ming-tts-catalog.json";
import { CodedError } from "../../../../shared/errors";
import { RetryBudget } from "../../../../shared/retry-budget";
import { appRoot, dataRoot } from "../../../runtime/config";
import { defaultPython } from "../../../runtime/platform";
import { command } from "../../../runtime/process";
import { WorkQueue } from "../../../jobs/queue";
import { publishSpeechWave } from "../local-wave";
import { speechModelDirectory } from "../paths";
import type { SpeechProvider } from "../types";

const queue = new WorkQueue(1);
export const mingPython = () => {
  const managed = path.join(
    dataRoot,
    "ming-tts-venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  return process.env.MING_TTS_PYTHON || (existsSync(managed) ? managed : defaultPython());
};
export const mingRuntimeArguments = () => [
  path.join(
    appRoot,
    `src/server/audio/providers/ming-tts/${process.platform === "darwin" && process.arch === "arm64" ? "mlx_adapter.py" : "adapter.py"}`,
  ),
  "--models",
  speechModelDirectory("ming-tts"),
  "--catalog",
  path.join(appRoot, "src/shared/ming-tts-catalog.json"),
];
function selection(voice: string, language?: string) {
  const preset = catalog.voices.find((item) => item.id === voice);
  const target = language || preset?.language;
  if (!preset || !catalog.languages.some((item) => item.id === target))
    throw new CodedError("INVALID_REQUEST", "Choose a Ming neutral voice and supported language.");
  return { preset, target: target! };
}
export const mingSpeechProvider: SpeechProvider = {
  id: "ming-tts",
  async readiness(signal, voice = catalog.defaultVoice, language) {
    signal.throwIfAborted();
    selection(voice, language);
    let detail = "";
    for (const _attempt of new RetryBudget(2)) {
      try {
        await command(
          mingPython(),
          [...mingRuntimeArguments(), "--check", "--voice", voice],
          appRoot,
          signal,
          () => {},
          30000,
        );
        return {
          available: true,
          detail: `Local Ming-3.0-TTS 0.5B · preset and reference voices · ${process.platform === "darwin" && process.arch === "arm64" ? "Apple Silicon MLX" : "CUDA"}. No provider credits.`,
        };
      } catch (error) {
        signal.throwIfAborted();
        detail = (error as Error).message;
      }
    }
    return {
      available: false,
      detail: `Ming-3.0-TTS is unavailable: ${detail}. Run npm run speech:setup:ming.`,
    };
  },
  async synthesize(text, file, voice, speed, signal, language) {
    const { target } = selection(voice, language);
    if (
      !text.trim() ||
      catalog.blockedTags.some((tag) => text.includes(tag)) ||
      /<\|[^>]*\|>/.test(text)
    )
      throw new CodedError(
        "INVALID_REQUEST",
        "Ming narration accepts spoken words only; expression tags and model control tokens are disabled.",
      );
    return queue.run(async () => {
      signal.throwIfAborted();
      const ready = await mingSpeechProvider.readiness(signal, voice, target);
      if (!ready.available) throw new CodedError("SPEECH_NOT_READY", ready.detail);
      return publishSpeechWave({
        text,
        file,
        signal,
        tempo: speed,
        generate: async (script, output) => {
          await command(
            mingPython(),
            [
              ...mingRuntimeArguments(),
              "--text-file",
              script,
              "--output",
              output,
              "--voice",
              voice,
              "--language",
              target,
            ],
            path.dirname(file),
            signal,
            () => {},
            600000,
          );
        },
      });
    }, signal);
  },
};
