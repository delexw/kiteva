import path from "node:path";
import { qwenVoices } from "../../../../shared/speech";
import { appRoot } from "../../../runtime/config";
import { createQwenSpeechProvider } from "../qwen-runtime";
import { speechModelDirectory } from "../paths";

export const qwenModelDirectory = speechModelDirectory("qwen3-tts");
export const qwenAdapter = path.join(appRoot, "src/server/audio/providers/qwen3-tts/adapter.py");
export const qwenCatalog = path.join(appRoot, "src/shared/qwen-tts-catalog.json");
export const qwenRuntimeArguments = () => [
  qwenAdapter,
  "--models",
  qwenModelDirectory,
  "--catalog",
  qwenCatalog,
];
export const qwenSpeechProvider = createQwenSpeechProvider({
  id: "qwen3-tts",
  label: "Qwen3-TTS 1.7B VoiceDesign",
  setupCommand: "speech:setup:qwen",
  voices: qwenVoices,
  runtimeArguments: qwenRuntimeArguments,
});
