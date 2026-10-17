import type { SpeechReadiness, SpeechProviderId } from "../../../shared/speech";

export type { SpeechProviderId } from "../../../shared/speech";

/** A local speech engine; renderers consume its validated WAV, never its model files. */
export interface SpeechProvider {
  readonly id: SpeechProviderId;
  readiness(signal: AbortSignal, voice?: string, language?: string): Promise<SpeechReadiness>;
  synthesize(
    text: string,
    file: string,
    voice: string,
    speed: number,
    signal: AbortSignal,
    language?: string,
  ): Promise<number>;
}
