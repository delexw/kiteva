import path from "node:path";
import { qwenBaseVoices } from "../../../../shared/speech";
import { appRoot } from "../../../runtime/config";
import { createQwenSpeechProvider } from "../qwen-runtime";
import { speechModelDirectory } from "../paths";

export const qwenBaseRuntimeArguments = () => [
  path.join(appRoot, "src/server/audio/providers/qwen3-tts-base/adapter.py"),
  "--models",
  speechModelDirectory("qwen3-tts-base"),
  "--catalog",
  path.join(appRoot, "src/shared/qwen-base-tts-catalog.json"),
];
export const qwenBaseSpeechProvider = createQwenSpeechProvider({
  id: "qwen3-tts-base",
  label: "Qwen3-TTS 1.7B Base",
  setupCommand: "speech:setup:qwen:base",
  voices: qwenBaseVoices,
  runtimeArguments: qwenBaseRuntimeArguments,
});
