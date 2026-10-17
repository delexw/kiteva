import path from "node:path";
import { parseArgs } from "node:util";
import { pocketLanguages } from "../src/shared/speech";
import { speechModelDirectory } from "../src/server/audio/providers/paths";
import { pocketTtsSpeechProvider } from "../src/server/audio/providers/pocket-tts";
import { appRoot, dataRoot } from "../src/server/runtime/config";
import { command } from "../src/server/runtime/process";
const { values } = parseArgs({ options: { language: { type: "string" } } });
const languages = values.language
  ? pocketLanguages.filter((language) => language.model === values.language)
  : pocketLanguages;
if (!languages.length)
  throw Error(`Choose a language: ${pocketLanguages.map((language) => language.model).join(", ")}`);
const signal = AbortSignal.timeout(3600000);
const environment = path.join(dataRoot, "pocket-tts-venv");
const python = path.join(
  environment,
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
await command(
  process.env.SPEECH_SETUP_PYTHON || "python3",
  ["-m", "venv", environment],
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
    path.join(appRoot, "scripts/pocket-tts-requirements.txt"),
    ...(process.platform === "linux"
      ? ["--extra-index-url", "https://download.pytorch.org/whl/cpu"]
      : []),
  ],
  appRoot,
  signal,
  (text) => process.stdout.write(text),
  600000,
);
for (const language of languages) {
  await command(
    python,
    [
      path.join(appRoot, "scripts/speech/pocket-tts.py"),
      "--models",
      speechModelDirectory("pocket-tts"),
      "--language",
      language.model,
      "--setup",
    ],
    appRoot,
    signal,
    (text) => process.stdout.write(text),
    1200000,
  );
}
if (languages.some((language) => language.id === "en"))
  await pocketTtsSpeechProvider.synthesize(
    "Your Pocket narrator is ready.",
    path.join(dataRoot, "pocket-tts-setup.wav"),
    "pocket_alba",
    1,
    signal,
  );
console.log("Pocket TTS ready. Models: models/pocket-tts; Python: .data/pocket-tts-venv.");
