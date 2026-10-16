import type { SpeechReadiness } from "../../../shared/speech";

export type SpeechProviderId = "kokoro" | "pocket-tts";

/** A local speech engine; renderers consume its validated WAV, never its model files. */
export interface SpeechProvider {
  readonly id: SpeechProviderId;
  readiness(signal: AbortSignal): Promise<SpeechReadiness>;
  synthesize(
    text: string,
    file: string,
    voice: string,
    speed: number,
    signal: AbortSignal,
  ): Promise<number>;
}
