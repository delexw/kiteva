import path from "node:path";
import { appRoot } from "../../runtime/config";
import type { SpeechProviderId } from "./types";

export function speechModelDirectory(provider: SpeechProviderId | "pocket-tts-zh") {
  return path.join(appRoot, "models", provider);
}
