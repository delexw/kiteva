import type { ScriptItem } from "../../shared/script-items";
import { deliverySpeech, type VideoLanguage } from "../../shared/video-language";
import { activeSpeech, type SpeechReadiness, type SpeechSettings } from "../../shared/speech";
import { CodedError } from "../../shared/errors";
import { api } from "./api";

/** Prevent an older, still-running worker from silently dropping the new request field. */
export async function ensureSpeechGenerationReady(request: {
  subtitles?: { mode: string };
  speech?: SpeechSettings;
  scriptItems?: ScriptItem[];
  outputLanguage?: VideoLanguage;
}) {
  const speech = activeSpeech({ ...request, speech: deliverySpeech(request) });
  if (!speech && !request.outputLanguage && request.scriptItems === undefined) return;
  const setup = await api<{
    speechSupported?: boolean;
    scriptItemsSupported?: boolean;
    generatedScriptItemsSupported?: boolean;
    speechStartSupported?: boolean;
    videoLanguageSupported?: boolean;
  }>("/api/setup");
  if (request.outputLanguage && !setup.videoLanguageSupported)
    throw new CodedError(
      "INVALID_REQUEST",
      "The generation worker needs to reload language support after active jobs finish. Your draft is saved; no generation was started.",
    );
  if (request.scriptItems !== undefined) {
    if (!setup.scriptItemsSupported)
      throw new CodedError(
        "SPEECH_NOT_READY",
        "Reload the generation worker to enable timed script items. Your draft is saved.",
      );
    if (
      request.scriptItems.some((item) => item.source === "write") &&
      !setup.generatedScriptItemsSupported
    )
      throw new CodedError(
        "SPEECH_NOT_READY",
        "Reload the generation worker to enable generated script items. Your draft is saved.",
      );
    for (const item of request.scriptItems)
      if (item.speech.mode === "narration") {
        const voice = item.speech;
        const status = await api<SpeechReadiness>(
          `/api/speech/status?engine=${voice.engine || "kokoro"}&voice=${voice.voice}${voice.language ? `&language=${voice.language}` : ""}`,
        );
        if (!status.available) throw new CodedError("SPEECH_NOT_READY", status.detail);
      }
    return;
  }
  if (!speech) return;
  if (!setup.speechSupported)
    throw new CodedError(
      "SPEECH_NOT_READY",
      "The generation worker needs to reload this feature after active jobs finish. Your draft is saved; no generation was started.",
    );
  if (speech.mode === "narration" && (speech.startSeconds ?? 0) > 0 && !setup.speechStartSupported)
    throw new CodedError(
      "SPEECH_NOT_READY",
      "The generation worker needs to reload narration start-time support after active jobs finish. Your draft is saved; no generation was started.",
    );
  if (speech.mode === "narration") {
    const status = await api<SpeechReadiness>(
      `/api/speech/status?engine=${speech.engine || "kokoro"}&voice=${speech.voice}${speech.language ? `&language=${speech.language}` : ""}`,
    );
    if (!status.available) throw new CodedError("SPEECH_NOT_READY", status.detail);
  }
}
