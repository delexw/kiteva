import type { SpeechProviderId } from "../../../shared/speech";
import { kokoroSpeechProvider } from "./kokoro";
import { pocketTtsSpeechProvider } from "./pocket-tts";
import type { SpeechProvider } from "./types";
const providers: Record<SpeechProviderId, SpeechProvider> = {
  kokoro: kokoroSpeechProvider,
  "pocket-tts": pocketTtsSpeechProvider,
};
export function speechProvider(engine: SpeechProviderId = "kokoro") {
  return providers[engine];
}
