import path from "node:path";
import { mkdir } from "node:fs/promises";
import { appRoot, dataRoot } from "../src/server/runtime/config";
import { command } from "../src/server/runtime/process";

const signal = AbortSignal.timeout(900000);
const environment = path.join(dataRoot, "speech-venv");
const python = path.join(
  environment,
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
await mkdir(dataRoot, { recursive: true });
await command(
  process.env.SPEECH_SETUP_PYTHON || "python3",
  ["-m", "venv", environment],
  appRoot,
  signal,
);
await command(
  python,
  ["-m", "pip", "install", "-r", path.join(appRoot, "scripts/speech-requirements.txt")],
  appRoot,
  signal,
  (text) => process.stdout.write(text),
  600000,
);
await command(
  process.execPath,
  [
    path.join(appRoot, "node_modules/hyperframes/bin/hyperframes.mjs"),
    "tts",
    "Your local narrator is ready.",
    "--output",
    path.join(dataRoot, "speech-setup.wav"),
    "--json",
  ],
  appRoot,
  signal,
  (text) => process.stdout.write(text),
  300000,
  false,
  () => {},
  { HYPERFRAMES_PYTHON: python },
);
console.log(
  "Local narration is ready. Kiteva uses .data/speech-venv automatically unless HYPERFRAMES_PYTHON overrides it.",
);
