import path from "node:path";
import { mkdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { appRoot, dataRoot } from "../src/server/runtime/config";
import { defaultPython } from "../src/server/runtime/platform";
import { command } from "../src/server/runtime/process";
import { kokoroSpeechProvider } from "../src/server/audio/providers/kokoro";
import {
  pocketZhModelDirectory,
  pocketZhSpeechProvider,
  pocketZhVoiceReference,
} from "../src/server/audio/providers/pocket-tts/chinese";
import { pocketVoices } from "../src/shared/speech";
const signal = AbortSignal.timeout(3600000);
const environment = path.join(dataRoot, "pocket-tts-zh-venv");
const python = path.join(
  environment,
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
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
    path.join(appRoot, "src/server/audio/providers/pocket-tts/chinese-requirements.txt"),
    ...(process.platform === "linux"
      ? ["--extra-index-url", "https://download.pytorch.org/whl/cpu"]
      : []),
  ],
  appRoot,
  signal,
  (text) => process.stdout.write(text),
  1200000,
);
const voices = path.join(pocketZhModelDirectory, "voices");
await mkdir(voices, { recursive: true });
// Synthetic Mandarin references, not claimed community presets or human voice clones.
for (const voice of pocketVoices.filter((item) => item.language === "zh")) {
  const reference = pocketZhVoiceReference(voice.id);
  try {
    await access(reference);
    continue;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await kokoroSpeechProvider.synthesize(
    "你好，欢迎来到创作空间。让我们把想法变成画面，用自然清晰的声音讲述故事。",
    reference,
    voice.reference.slice("synthetic:kokoro/".length),
    1,
    signal,
  );
}
await command(
  python,
  [
    path.join(appRoot, "src/server/audio/providers/pocket-tts/chinese.py"),
    "--models",
    pocketZhModelDirectory,
    "--setup",
  ],
  appRoot,
  signal,
  (text) => process.stdout.write(text),
  1200000,
);
await pocketZhSpeechProvider.synthesize(
  "让你的创意成为现实。我们用清晰自然的中文，讲述属于你的故事。",
  path.join(dataRoot, "pocket-tts-zh-setup.wav"),
  "pocket_zh_xiaobei",
  1,
  signal,
);
console.log(
  "Chinese Pocket TTS ready. Models: models/pocket-tts-zh. References: eight synthetic Kokoro Mandarin voices.",
);
