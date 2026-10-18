import path from "node:path";
import { existsSync } from "node:fs";
import { appRoot, dataRoot } from "../../runtime/config";
import { defaultPython } from "../../runtime/platform";
import { command } from "../../runtime/process";
import { WorkQueue } from "../../jobs/queue";
import { CodedError } from "../../../shared/errors";
import { publishSpeechWave } from "./local-wave";
import { pocketVoices } from "../../../shared/speech";
import type { SpeechProvider } from "./types";
import { speechModelDirectory } from "./paths";

export const pocketZhModelDirectory = speechModelDirectory("pocket-tts-zh");
const managedPython = path.join(
  dataRoot,
  "pocket-tts-zh-venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const python = () =>
  process.env.POCKET_TTS_ZH_PYTHON || (existsSync(managedPython) ? managedPython : defaultPython());
const script = path.join(appRoot, "scripts/speech/pocket-tts-zh.py");
const queue = new WorkQueue(1);
/** Resolve only catalogued synthetic references; caller input never becomes a file path. */
export function pocketZhVoiceReference(voice: string) {
  const preset = pocketVoices.find(
    (item) =>
      item.id === voice && item.language === "zh" && item.reference.startsWith("synthetic:kokoro/"),
  );
  if (!preset)
    throw new CodedError("INVALID_REQUEST", "Choose a Chinese Pocket TTS reference voice.");
  return path.join(pocketZhModelDirectory, "voices", `${preset.id.slice("pocket_zh_".length)}.wav`);
}
/** Mandarin is a separate checkpoint and runtime behind the Pocket TTS UI choice. */
export const pocketZhSpeechProvider: SpeechProvider = {
  id: "pocket-tts",
  async readiness(signal, voice = "pocket_zh_xiaobei") {
    const reference = pocketZhVoiceReference(voice);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await command(
          python(),
          [script, "--models", pocketZhModelDirectory, "--reference", reference, "--check"],
          appRoot,
          signal,
          () => {},
          30000,
        );
        return {
          available: true,
          detail: "Local narration · Pocket TTS · Chinese. No provider credits.",
        };
      } catch {
        signal.throwIfAborted();
      }
    }
    return {
      available: false,
      detail:
        "Chinese Pocket TTS needs setup. Run npm run speech:setup:pocket:zh or see docs/speech.md.",
    };
  },
  async synthesize(text, file, voice, speed, signal) {
    const reference = pocketZhVoiceReference(voice);
    return queue.run(async () => {
      const status = await pocketZhSpeechProvider.readiness(signal, voice);
      if (!status.available) throw new CodedError("SPEECH_NOT_READY", status.detail);
      return publishSpeechWave({
        text,
        file,
        tempo: speed,
        signal,
        generate: async (textFile, output) => {
          await command(
            python(),
            [
              script,
              "--models",
              pocketZhModelDirectory,
              "--reference",
              reference,
              "--text-file",
              textFile,
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
