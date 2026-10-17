import { activeSpeech, type SpeechReadiness, type SpeechSettings } from "../../shared/speech";
import { CodedError } from "../../shared/errors";
import { api } from "./api";

/** Prevent an older, still-running worker from silently dropping the new request field. */
export async function ensureSpeechGenerationReady(request: {
  lyrics?: { mode: string };
  speech?: SpeechSettings;
}) {
  const speech = activeSpeech(request);
  if (!speech) return;
  const setup = await api<{ speechSupported?: boolean }>("/api/setup");
  if (!setup.speechSupported)
    throw new CodedError(
      "SPEECH_NOT_READY",
      "The generation worker needs to reload this feature after active jobs finish. Your draft is saved; no generation was started.",
    );
  if (speech.mode === "narration") {
    const status = await api<SpeechReadiness>(
      `/api/speech/status?engine=${speech.engine || "kokoro"}&voice=${speech.voice}${speech.language ? `&language=${speech.language}` : ""}`,
    );
    if (!status.available) throw new CodedError("SPEECH_NOT_READY", status.detail);
  }
}
