import { z } from "zod";
import { SpeechSettingsSchema, speechLanguage } from "./speech";
import { VideoLanguageSchema, type VideoLanguage } from "./video-language";
import type { VideoRequest } from "./domains/video";

export const LanguageTracksSchema = z
  .object({
    narration: z
      .array(z.object({ language: VideoLanguageSchema, speech: SpeechSettingsSchema.options[1] }))
      .max(2),
    subtitles: z.array(VideoLanguageSchema).max(2),
    defaultNarration: VideoLanguageSchema.optional(),
    defaultSubtitle: z.union([VideoLanguageSchema, z.literal("off")]).default("off"),
  })
  .superRefine((settings, ctx) => {
    for (const track of settings.narration) {
      const checked = SpeechSettingsSchema.safeParse(track.speech);
      if (
        speechLanguage(track.speech.voice, track.speech.engine, track.language)?.split("-")[0] !==
        track.language
      )
        ctx.addIssue({
          code: "custom",
          message: "Choose a voice supporting this narration language.",
        });
      if (!checked.success)
        for (const issue of checked.error.issues)
          ctx.addIssue({
            code: "custom",
            path: ["narration", settings.narration.indexOf(track), "speech", ...issue.path],
            message: issue.message,
          });
    }
    const languages = settings.narration.map((track) => track.language);
    if (
      new Set(languages).size !== languages.length ||
      new Set(settings.subtitles).size !== settings.subtitles.length
    )
      ctx.addIssue({ code: "custom", message: "Each language must appear only once." });
    if (settings.defaultNarration && !languages.includes(settings.defaultNarration))
      ctx.addIssue({ code: "custom", message: "Default narration must be enabled." });
    if (
      settings.defaultSubtitle !== "off" &&
      !settings.subtitles.includes(settings.defaultSubtitle)
    )
      ctx.addIssue({ code: "custom", message: "Default subtitles must be enabled." });
  });
export type LanguageTracks = z.infer<typeof LanguageTracksSchema>;
export type LanguageMedia = {
  narration: { language: VideoLanguage; video: string; audio: string; mix: string }[];
  subtitles: { language: VideoLanguage; vtt: string; srt: string }[];
  musicVideo: string;
  defaultNarration?: VideoLanguage;
  defaultSubtitle: VideoLanguage | "off";
};

/** Global narration settings override voices, not which script items contain speech. */
export function applyLanguageTracks(request: VideoRequest): VideoRequest {
  const settings = request.languageTracks;
  if (!settings) return request;
  const profile =
    settings.narration.find((track) => track.language === settings.defaultNarration) ||
    settings.narration[0];
  const speech = profile
    ? { ...profile.speech, language: profile.language, followVideoLanguage: false }
    : { mode: "off" as const };
  return {
    ...request,
    speech:
      speech.mode === "narration"
        ? {
            ...speech,
            source: request.speech?.mode === "narration" ? request.speech.source : "write",
            text: request.speech?.mode === "narration" ? request.speech.text : "",
          }
        : speech,
    scriptItems: request.scriptItems?.map((item) => ({
      ...item,
      speech: item.speech.mode === "off" ? item.speech : speech,
    })),
  };
}
export function languageTracksDirection(request: VideoRequest) {
  if (!request.languageTracks) return "";
  return `LANGUAGE TRACKS: Video language controls only text built into the visuals. Narration languages: ${request.languageTracks.narration.map((track) => track.language).join(", ") || "none"}; subtitle languages: ${request.languageTracks.subtitles.join(", ") || "none"}. Author the primary narration in ${request.languageTracks.defaultNarration || request.languageTracks.narration[0]?.language || request.outputLanguage || "the idea language"}. Plan one shared visual timeline with enough space for each enabled spoken language. Keep subtitles out of the rendered pixels: record their exact text and times in STORYBOARD.json audio.subtitles and narration cues for separate selectable tracks. Titles, labels and credits remain authored visual text. Create only the primary narration through create_narration; the application translates and generates alternate tracks afterward. Keep music and effects separate from narration; never embed or duplicate narration in rendered scenes.`;
}
