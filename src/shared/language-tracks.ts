import { z } from "zod";
import { SpeechSettingsSchema, speechLanguage, mingVoices } from "./speech";
import {
  sharedVideoScript,
  deliverySpeech,
  VideoLanguageSchema,
  videoLanguages,
  type VideoLanguage,
} from "./video-language";
import type { VideoRequest } from "./domains/video";

export const LanguageTracksSchema = z
  .object({
    narration: z
      .array(z.object({ language: VideoLanguageSchema, speech: SpeechSettingsSchema.options[1] }))
      .max(videoLanguages.length),
    subtitles: z.array(VideoLanguageSchema).max(videoLanguages.length),
    defaultNarration: VideoLanguageSchema.optional(),
    showSubtitles: z.boolean().optional(),
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

/** One enabled-language selection produces matching narration and subtitle tracks. */
export function selectLanguageTrackLanguages(
  request: Pick<VideoRequest, "languageTracks" | "speech" | "scriptItems" | "outputLanguage">,
  languages: VideoLanguage[],
): LanguageTracks {
  const current = request.languageTracks;
  const selected = [...new Set(languages)];
  const narration = selected.map((language) => {
    const existing = current?.narration.find((track) => track.language === language);
    if (existing) return existing;
    const source =
      request.scriptItems?.find((item) => item.speech.mode === "narration")?.speech ||
      request.speech;
    let speech = deliverySpeech({
      outputLanguage: language,
      speech: {
        ...SpeechSettingsSchema.options[1].parse(
          source?.mode === "narration" ? source : { mode: "narration" },
        ),
        followVideoLanguage: true,
      },
    });
    if (
      speech?.mode === "narration" &&
      (!SpeechSettingsSchema.safeParse(speech).success ||
        speechLanguage(speech.voice, speech.engine, language)?.split("-")[0] !== language)
    ) {
      // A newly added language needs a valid editable profile, even when the prior engine cannot speak it.
      // This is a settings default, never an inference-time provider fallback.
      speech = SpeechSettingsSchema.options[1].parse({
        ...speech,
        engine: "ming-tts",
        voice: mingVoices[0].id,
        language,
      });
    }
    if (speech?.mode !== "narration") throw Error("No narration profile");
    return { language, speech: { ...speech, language, followVideoLanguage: false } };
  });
  const defaultLanguage = selected[0];
  return {
    narration,
    subtitles: current?.showSubtitles === false ? [] : selected,
    ...(current?.showSubtitles !== undefined ? { showSubtitles: current.showSubtitles } : {}),
    defaultNarration: defaultLanguage,
    defaultSubtitle: current?.showSubtitles === false ? "off" : defaultLanguage || "off",
  };
}

export function primaryNarrationProfile(settings: LanguageTracks) {
  return (
    settings.narration.find((track) => track.language === settings.defaultNarration) ||
    settings.narration[0]
  );
}

/** Selected languages and subtitle visibility govern the entire timed script. */
export function applyLanguageTracks(request: VideoRequest): VideoRequest {
  const settings = request.languageTracks;
  if (!settings) return request;
  const profile = primaryNarrationProfile(settings);
  const speech = profile
    ? { ...profile.speech, language: profile.language, followVideoLanguage: false }
    : { mode: "off" as const };
  return {
    ...request,
    subtitles:
      settings.showSubtitles === false || !settings.subtitles.length
        ? { mode: "off" }
        : request.subtitles,
    speech:
      speech.mode === "narration"
        ? {
            ...speech,
            source:
              request.speech?.mode === "narration"
                ? request.speech.source === "subtitles" &&
                  (settings.showSubtitles === false || !settings.subtitles.length)
                  ? "provided"
                  : request.speech.source
                : request.subtitles?.mode === "provided"
                  ? "provided"
                  : "write",
            text:
              request.speech?.mode === "narration"
                ? request.speech.text
                : sharedVideoScript(request),
          }
        : speech,
    scriptItems: request.scriptItems?.map((item) => ({
      ...item,
      speech,
      showSubtitles: settings.showSubtitles !== false,
    })),
  };
}
export function languageTracksDirection(request: VideoRequest) {
  if (!request.languageTracks) return "";
  return `LANGUAGE TRACKS: Video language controls only text built into the visuals. Narration languages: ${request.languageTracks.narration.map((track) => track.language).join(", ") || "none"}; subtitle languages: ${request.languageTracks.subtitles.join(", ") || "none"}. Author the primary narration in ${request.languageTracks.defaultNarration || request.languageTracks.narration[0]?.language || request.outputLanguage || "the idea language"}. Plan one shared visual timeline with enough space for each enabled spoken language. ${subtitleRenderingDirection(request)} Record their exact text and times in STORYBOARD.json audio.subtitles and narration cues. Titles, labels and credits remain authored visual text. Create only the primary narration through create_narration; the application translates and generates alternate tracks afterward. Keep music and effects separate from narration; never embed or duplicate narration in rendered scenes.`;
}

function subtitleRenderingDirection(request: VideoRequest) {
  return request.languageTracks?.showSubtitles === false
    ? "Subtitles are off: do not render narration subtitles into the video. Titles, labels and credits are unaffected."
    : "Render narration subtitles directly into the video, synchronized to the measured narration cues. Keep them readable and scale them with the composition. Do not rely on a separate player subtitle overlay or playback toggle.";
}
