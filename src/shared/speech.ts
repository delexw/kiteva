import mingCatalog from "./ming-tts-catalog.json";
import { normalizeSubtitleFields } from "./subtitle-compatibility";
import { z } from "zod";
import pocketCatalog from "./pocket-tts-catalog.json";

export const SpeechProviderIdSchema = z.enum(["kokoro", "pocket-tts", "ming-tts"]);
export type SpeechProviderId = z.infer<typeof SpeechProviderIdSchema>;
export const speechEngines = [
  { id: "ming-tts", label: "Ming-3.0-TTS · 0.5B · Neutral" },
  { id: "kokoro", label: "Kokoro" },
  { id: "pocket-tts", label: "Pocket TTS" },
] as const;
export const kokoroVoices = [
  { id: "af_heart", label: "Heart", language: "en-us" },
  { id: "af_nova", label: "Nova", language: "en-us" },
  { id: "af_sky", label: "Sky", language: "en-us" },
  { id: "am_adam", label: "Adam", language: "en-us" },
  { id: "am_michael", label: "Michael", language: "en-us" },
  { id: "bf_emma", label: "Emma", language: "en-gb" },
  { id: "bf_isabella", label: "Isabella", language: "en-gb" },
  { id: "bm_george", label: "George", language: "en-gb" },
  { id: "ef_dora", label: "Dora", language: "es" },
  { id: "ff_siwis", label: "Siwis", language: "fr-fr" },
  { id: "jf_alpha", label: "Alpha", language: "ja" },
  { id: "zf_xiaobei", label: "Xiaobei", language: "zh" },
] as const;
export const mingVoices = mingCatalog.voices;
export const mingLanguages = mingCatalog.languages;
export const mingBlockedTags = mingCatalog.blockedTags;
export const mingNarrationGuidance =
  "MING NEUTRAL NARRATION: For ming-tts, use only the configured preset or reference voice. Write plain spoken words, without inline expression tags or model control tokens. Emotion variants, emotion controls, freeform delivery instructions, voice design and acting directions are disabled. Do not add them to cue text. The adapter owns preset/reference task selection; speed and volume are handled by application audio processing.";
export const mingVoiceGroups = groupSpeechVoices(mingVoices);
export const pocketLanguages = pocketCatalog.languages;
export const pocketVoices = pocketCatalog.voices.map((voice) => ({
  ...voice,
  id: `pocket_${voice.id}`,
}));
function groupSpeechVoices(voices: readonly { id: string; label: string; gender: string }[]) {
  return [
    { label: "Female", gender: "female" },
    { label: "Male", gender: "male" },
  ].map(({ label, gender }) => ({
    label,
    options: voices
      .filter((voice) => voice.gender === gender)
      .map((voice) => ({ value: voice.id, label: voice.label })),
  }));
}
export const pocketVoiceGroups = groupSpeechVoices(pocketVoices);
export function pocketLanguageForVoice(voice: string, language?: string) {
  const preset = pocketVoices.find((item) => item.id === voice);
  const selected = preset
    ? pocketLanguages.find((item) => item.id === (language || preset.language))
    : undefined;
  if ((preset?.language === "zh") !== (selected?.id === "zh")) return undefined;
  return selected;
}
export const PocketLanguageSchema = z.enum(pocketLanguages.map((language) => language.id));
export function speechLanguage(
  voice: string,
  engine: SpeechProviderId = "kokoro",
  language?: string,
) {
  if (engine === "ming-tts")
    return mingLanguages.find(
      (item) =>
        item.id === (language || mingVoices.find((voiceItem) => voiceItem.id === voice)?.language),
    )?.id;
  return engine === "pocket-tts"
    ? pocketLanguageForVoice(voice, language)?.id
    : kokoroVoices.find((item) => item.id === voice)?.language;
}
export const speechVoices = [...mingVoices, ...kokoroVoices, ...pocketVoices] as const;
export function speechVoicesForEngine(engine: SpeechProviderId = "kokoro") {
  return engine === "ming-tts" ? mingVoices : engine === "pocket-tts" ? pocketVoices : kokoroVoices;
}
export const SpeechLanguageSchema = z.enum([
  ...new Set([
    ...pocketLanguages.map((language) => language.id),
    ...mingLanguages.map((language) => language.id),
  ]),
]);
export const SpeechSettingsSchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("off") }),
    z.object({
      mode: z.literal("narration"),
      engine: SpeechProviderIdSchema.optional(),
      language: SpeechLanguageSchema.optional(),
      followVideoLanguage: z.boolean().optional(),
      voice: z.enum(speechVoices.map((voice) => voice.id)).default("af_heart"),
      volume: z.number().min(0).max(2).optional(),
      speed: z.number().min(0.75).max(1.5).default(1),
      startSeconds: z.number().finite().min(0).max(300).optional(),
      source: z
        .preprocess(
          (source) => normalizeSubtitleFields({ source }).source,
          z.enum(["subtitles", "write", "provided"]),
        )
        .default("subtitles"),
      text: z.string().max(8000).default(""),
      instructions: z.string().max(2000).default(""),
    }),
    z.object({ mode: z.literal("uploaded"), assetId: z.string().min(1) }),
  ])
  .superRefine((settings, context) => {
    if (
      settings.mode === "narration" &&
      settings.engine === "ming-tts" &&
      settings.language &&
      !mingLanguages.some((item) => item.id === settings.language)
    )
      context.addIssue({
        code: "custom",
        path: ["language"],
        message: "Choose a supported Ming narration language.",
      });
    if (
      settings.mode === "narration" &&
      settings.engine === "pocket-tts" &&
      !pocketLanguageForVoice(settings.voice, settings.language)
    )
      context.addIssue({
        code: "custom",
        path: ["voice"],
        message: "Choose a voice compatible with the selected Pocket TTS language.",
      });
    if (
      settings.mode === "narration" &&
      !speechVoicesForEngine(settings.engine).some((voice) => voice.id === settings.voice)
    )
      context.addIssue({
        code: "custom",
        path: ["voice"],
        message: "Choose a voice belonging to the selected speech engine.",
      });
  });
export type SpeechSettings = z.infer<typeof SpeechSettingsSchema>;
/** Profile edits change generated audio, not the saved script or unrelated engines' caches. */
export function speechVoiceDefinition(settings?: {
  mode: string;
  engine?: SpeechProviderId;
  voice?: string;
}) {
  if (settings?.mode === "narration" && settings.engine === "ming-tts")
    return {
      model: mingCatalog.model,
      revision: mingCatalog.modelRevision,
      mlxModel: mingCatalog.mlxModel,
      mlxRevision: mingCatalog.mlxRevision,
      policyRevision: mingCatalog.policyRevision,
      ip: mingVoices.find((voice) => voice.id === settings.voice)?.ip,
      reference: mingVoices.find((voice) => voice.id === settings.voice)?.referenceAudio
        ? mingVoices.find((voice) => voice.id === settings.voice)
        : undefined,
      task: mingVoices.find((voice) => voice.id === settings.voice)?.referenceAudio ? "TTS" : "IP",
    };
  return undefined;
}
export const SpeechTrackSchema = z.object({
  file: z.string(),
  durationSeconds: z.number().positive(),
  source: z.enum(["narration", "uploaded"]),
  cues: z.array(
    z.object({
      text: z.string(),
      startSeconds: z.number(),
      endSeconds: z.number(),
      scriptItemId: z.string().optional(),
      showSubtitles: z.boolean().optional(),
    }),
  ),
});
export type SpeechTrack = z.infer<typeof SpeechTrackSchema>;
export type SpeechReadiness = { available: boolean; detail: string };

/** Only narration sourced from subtitles depends on the on-screen subtitles setting. */
export function activeSpeech(request: {
  subtitles?: { mode: string };
  speech?: SpeechSettings;
  scriptItems?: unknown[];
}): Exclude<SpeechSettings, { mode: "off" }> | undefined {
  if (request.scriptItems !== undefined) return undefined;
  const speech = request.speech;
  if (!speech || speech.mode === "off") return undefined;
  if (
    speech.mode === "narration" &&
    speech.source === "subtitles" &&
    (!request.subtitles || request.subtitles.mode === "off")
  )
    return undefined;
  return speech;
}

export function speechConfigurationProblem(request: {
  subtitles?: { mode: string };
  speech?: SpeechSettings;
  assetIds: string[];
  requirements?: { music: { assetIds: string[] } };
}) {
  const speech = activeSpeech(request);
  if (speech?.mode === "narration" && speech.source === "provided" && !speech.text.trim())
    return "Provide a narration script.";
  if (
    speech?.mode === "uploaded" &&
    (!request.assetIds.includes(speech.assetId) ||
      !request.requirements?.music.assetIds.includes(speech.assetId))
  )
    return "Choose an attached music file for uploaded vocals.";
  return undefined;
}
