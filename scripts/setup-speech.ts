import { defaultPython } from "../src/server/runtime/platform";
import path from "node:path";
import { access, copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { speechModelDirectory } from "../src/server/audio/providers/paths";
import { synthesizeSpeech } from "../src/server/audio/speech";
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
    path.join(appRoot, "src/server/audio/providers/kokoro/requirements.txt"),
  ],
  appRoot,
  signal,
  (text) => process.stdout.write(text),
  600000,
);
const modelDirectory = speechModelDirectory("kokoro");
await mkdir(modelDirectory, { recursive: true });
for (const [name, legacyFolder] of [
  ["kokoro-v1.0.onnx", "models"],
  ["voices-v1.0.bin", "voices"],
] as const) {
  const destination = path.join(modelDirectory, name);
  try {
    await access(destination);
    continue;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    const legacy = path.join(os.homedir(), ".cache/hyperframes/tts", legacyFolder, name);
    try {
      await copyFile(legacy, temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const response = await fetch(
        `https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/${name}`,
        { signal },
      );
      if (!response.ok) throw Error(`Kokoro download failed: ${response.status}`);
      await writeFile(temporary, new Uint8Array(await response.arrayBuffer()));
    }
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
await synthesizeSpeech(
  "Your local narrator is ready.",
  path.join(dataRoot, "speech-setup.wav"),
  "af_heart",
  1,
  signal,
);
console.log(
  "Local narration is ready. Model files: models/kokoro; managed Python: .data/speech-venv.",
);
