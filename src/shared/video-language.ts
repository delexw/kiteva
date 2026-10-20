import { z } from "zod";
import type { VideoRequest } from "./domains/video";
import { type SpeechSettings, speechLanguage } from "./speech";

export const VideoLanguageSchema = z.enum(["en", "zh"]);
export type VideoLanguage = z.infer<typeof VideoLanguageSchema>;
export const videoLanguages = [
  { value: "en", label: "English" },
  { value: "zh", label: "简体中文" },
] as const;
const CopySchema = z.object({
  lyrics: z.string().max(8000).optional(),
  narration: z.string().max(8000).optional(),
});
export const VideoTranslationsSchema = z.object({
  original: CopySchema,
  versions: z.record(z.string(), CopySchema).default({}),
});
export type VideoCopy = z.infer<typeof CopySchema>;
export function videoLanguageLabel(language: string) {
  return videoLanguages.find((item) => item.value === language)?.label || language;
}
/** Resolve the voice for this delivery without discarding the user's stored voice. */
export function deliverySpeech(
  request: Pick<VideoRequest, "speech" | "outputLanguage">,
): SpeechSettings | undefined {
  const speech = request.speech;
  if (
    speech?.mode !== "narration" ||
    !request.outputLanguage ||
    speech.followVideoLanguage === false
  )
    return speech;
  const language = request.outputLanguage;
  const current = speechLanguage(speech.voice, speech.engine, speech.language);
  const matches = language === "en" ? current?.startsWith("en") : current === "zh";
  return {
    ...speech,
    language: speech.engine === "pocket-tts" ? language : undefined,
    voice: matches
      ? speech.voice
      : speech.engine === "pocket-tts"
        ? language === "zh"
          ? "pocket_zh_xiaobei"
          : "pocket_alba"
        : language === "zh"
          ? "zf_xiaobei"
          : "af_heart",
  };
}
export function narrationLanguage(request: Pick<VideoRequest, "speech" | "outputLanguage">) {
  const speech = deliverySpeech(request);
  return speech?.mode === "narration"
    ? speechLanguage(speech.voice, speech.engine, speech.language)
    : request.outputLanguage;
}
/** Preserve the source and independently edited language versions when switching back. */
export function editVideoCopy(
  request: VideoRequest,
  field: keyof VideoCopy,
  text: string,
): VideoRequest {
  const language = field === "lyrics" ? request.outputLanguage : narrationLanguage(request);
  const existing = request.translations;
  const translations =
    existing && language
      ? {
          original: existing.original,
          versions: {
            ...existing.versions,
            [language]: { ...existing.versions[language], [field]: text },
          },
        }
      : undefined;
  return {
    ...request,
    translations,
    ...(field === "lyrics"
      ? { lyrics: text.trim() ? { mode: "provided" as const, text } : { mode: "write" as const } }
      : request.speech?.mode === "narration"
        ? { speech: { ...request.speech, text } }
        : {}),
  };
}
/** One editor feeds narration and optional on-screen text in the Assistant. */
export function sharedVideoScript(request: VideoRequest): string {
  return request.lyrics?.mode === "provided"
    ? request.lyrics.text
    : request.speech?.mode === "narration" && request.speech.source === "provided"
      ? request.speech.text
      : "";
}
export function editSharedVideoScript(request: VideoRequest, text: string): VideoRequest {
  const showText = Boolean(request.lyrics && request.lyrics.mode !== "off");
  let result = showText ? editVideoCopy(request, "lyrics", text) : request;
  if (result.speech?.mode === "narration") {
    result = editVideoCopy(result, "narration", text);
    if (result.speech?.mode === "narration")
      result = {
        ...result,
        speech: {
          ...result.speech,
          source: showText ? "lyrics" : text.trim() ? "provided" : "write",
        },
      };
  }
  return result;
}
export function videoLanguageDirection(language?: VideoLanguage) {
  return language
    ? `DELIVERY LANGUAGE: ${videoLanguageLabel(language)} (${language}). This setting overrides any different language requested in the idea or reference material. Write every authored title, label, caption, diagram annotation and end credit in this language. Use natural native wording, preserving factual meaning, brand names, proper names, code and URLs. Keep captured website UI and supplied images authentic; do not falsify translated captures. Use locally available fonts covering the selected script. For HyperFrames declare OS CJK fonts through @font-face with src:local(...) so font validation can resolve them; verify Chinese glyphs render rather than showing missing-character boxes. Reflow text, and recalculate reading holds and line breaks. The separately selected narration language controls spoken audio only.`
    : "";
}
