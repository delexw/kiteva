import type { SpeechProviderId } from "../../../shared/speech";
import { kokoroSpeechProvider } from "./kokoro";
import { pocketTtsSpeechProvider } from "./pocket-tts";
import { qwenSpeechProvider } from "./qwen3-tts";
import { qwenBaseSpeechProvider } from "./qwen3-tts-base";
import type { SpeechProvider } from "./types";
const providers: Record<SpeechProviderId, SpeechProvider> = {
  "qwen3-tts": qwenSpeechProvider,
  "qwen3-tts-base": qwenBaseSpeechProvider,
  kokoro: kokoroSpeechProvider,
  "pocket-tts": pocketTtsSpeechProvider,
};
export function speechProvider(engine: SpeechProviderId = "kokoro") {
  return providers[engine];
}
