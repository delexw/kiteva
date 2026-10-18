import { deliverySpeech, type VideoLanguage } from "../../shared/video-language";
import { activeSpeech, type SpeechReadiness, type SpeechSettings } from "../../shared/speech";
import { CodedError } from "../../shared/errors";
import { api } from "./api";

/** Prevent an older, still-running worker from silently dropping the new request field. */
export async function ensureSpeechGenerationReady(request: {
  lyrics?: { mode: string };
  speech?: SpeechSettings;
  outputLanguage?: VideoLanguage;
}) {
  const speech = activeSpeech({ ...request, speech: deliverySpeech(request) });
  if (!speech && !request.outputLanguage) return;
  const setup = await api<{ speechSupported?: boolean; videoLanguageSupported?: boolean }>(
    "/api/setup",
  );
  if (request.outputLanguage && !setup.videoLanguageSupported)
    throw new CodedError(
      "INVALID_REQUEST",
      "The generation worker needs to reload language support after active jobs finish. Your draft is saved; no generation was started.",
    );
  if (!speech) return;
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
