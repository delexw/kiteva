import path from "node:path";
import { existsSync } from "node:fs";
import { appRoot, dataRoot } from "../src/server/runtime/config";
import { defaultPython } from "../src/server/runtime/platform";
import { command } from "../src/server/runtime/process";
import { qwenRuntimeArguments, qwenSpeechProvider } from "../src/server/audio/providers/qwen3-tts";

import {
  qwenBaseRuntimeArguments,
  qwenBaseSpeechProvider,
} from "../src/server/audio/providers/qwen3-tts-base";

const base = process.argv.includes("--base");
const provider = base ? qwenBaseSpeechProvider : qwenSpeechProvider;
const runtimeArguments = base ? qwenBaseRuntimeArguments : qwenRuntimeArguments;
if (process.platform !== "darwin" || process.arch !== "arm64")
  throw Error("Local Qwen3-TTS requires an Apple Silicon Mac.");
const signal = AbortSignal.timeout(3600000);
const environment = path.join(dataRoot, "qwen3-tts-venv");
const python = path.join(environment, "bin/python");
await command(
  process.env.SPEECH_SETUP_PYTHON || defaultPython(),
  [
    "-m",
    "venv",
    ...(!existsSync(python) && existsSync(environment) ? ["--clear"] : []),
    environment,
  ],
  appRoot,
  signal,
);
await command(
  python,
  [
    "-m",
    "pip",
    "install",
    "-r",
    path.join(appRoot, "src/server/audio/providers/qwen3-tts/requirements.txt"),
  ],
  appRoot,
  signal,
  (text) => process.stdout.write(text),
  600000,
);
await command(
  python,
  [...runtimeArguments(), "--setup"],
  appRoot,
  signal,
  (text) => process.stdout.write(text),
  1200000,
);
await provider.synthesize(
  "Your local Qwen narrator is ready.",
  path.join(dataRoot, base ? "qwen3-tts-base-setup.wav" : "qwen3-tts-setup.wav"),
  base ? "qwen_base_female" : "qwen_bright_female",
  1,
  signal,
  "en",
);
console.log(
  `Qwen3-TTS ready: local 1.7B ${base ? "Base with male and female reference voices" : "VoiceDesign with selectable narration voice profiles"}.`,
);
