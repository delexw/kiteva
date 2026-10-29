import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import catalog from "../src/shared/ming-tts-catalog.json";
import { appRoot, dataRoot } from "../src/server/runtime/config";
import { command } from "../src/server/runtime/process";
import { defaultPython } from "../src/server/runtime/platform";
import { speechModelDirectory } from "../src/server/audio/providers/paths";
import { mingRuntimeArguments } from "../src/server/audio/providers/ming-tts";

const appleSilicon = process.platform === "darwin" && process.arch === "arm64";
if (process.platform === "darwin" && !appleSilicon)
  throw Error("Ming MLX requires Apple Silicon; Intel Macs are not supported.");
const signal = AbortSignal.timeout(3600000);
const folder = speechModelDirectory("ming-tts");
const runtime = path.join(folder, "runtime");
const environment = path.join(dataRoot, "ming-tts-venv");
const python = path.join(
  environment,
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
await mkdir(folder, { recursive: true });
await mkdir(dataRoot, { recursive: true });
if (!appleSilicon) {
  if (!existsSync(runtime)) {
    await command(
      "git",
      ["clone", "--no-checkout", "https://github.com/inclusionAI/Ming-3.0-tts.git", runtime],
      appRoot,
      signal,
      undefined,
      300000,
    );
    await command("git", ["checkout", "--detach", catalog.sourceRevision], runtime, signal);
  }
  const revision = (await command("git", ["rev-parse", "HEAD"], runtime, signal)).trim();
  if (revision !== catalog.sourceRevision)
    throw Error(
      "Managed Ming source revision differs from the reviewed revision; preserve or remove that runtime directory before setup.",
    );
}
await command(
  process.env.SPEECH_SETUP_PYTHON || defaultPython(),
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
    appleSilicon
      ? path.join(appRoot, "src/server/audio/providers/ming-tts/requirements-mlx.txt")
      : path.join(runtime, "requirements.txt"),
  ],
  appRoot,
  signal,
  (text) => process.stdout.write(text),
  1200000,
);
await command(
  python,
  appleSilicon
    ? [...mingRuntimeArguments(), "--setup"]
    : [
        path.join(appRoot, "src/server/audio/providers/ming-tts/setup.py"),
        folder,
        path.join(appRoot, "src/shared/ming-tts-catalog.json"),
      ],
  appRoot,
  signal,
  (text) => process.stdout.write(text),
  1200000,
);
await command(
  python,
  [...mingRuntimeArguments(), "--check", "--voice", catalog.defaultVoice],
  appRoot,
  signal,
  (text) => process.stdout.write(text),
  60000,
);
console.log("Ming-3.0-TTS 0.5B prepared with neutral-only built-in voice controls.");
