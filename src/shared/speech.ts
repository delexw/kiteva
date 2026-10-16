import { z } from "zod";

export const speechVoices = [
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
export const SpeechSettingsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("off") }),
  z.object({
    mode: z.literal("narration"),
    voice: z.enum(speechVoices.map((voice) => voice.id)).default("af_heart"),
    speed: z.number().min(0.75).max(1.5).default(1),
    source: z.enum(["lyrics", "write", "provided"]).default("lyrics"),
    text: z.string().max(8000).default(""),
    instructions: z.string().max(2000).default(""),
  }),
  z.object({ mode: z.literal("uploaded"), assetId: z.string().min(1) }),
]);
export type SpeechSettings = z.infer<typeof SpeechSettingsSchema>;
export const SpeechTrackSchema = z.object({
  file: z.string(),
  durationSeconds: z.number().positive(),
  source: z.enum(["narration", "uploaded"]),
  cues: z.array(z.object({ text: z.string(), startSeconds: z.number(), endSeconds: z.number() })),
});
export type SpeechTrack = z.infer<typeof SpeechTrackSchema>;
export type SpeechReadiness = { available: boolean; detail: string };

/** Retain saved choices when lyrics are off, but never synthesize or mix them. */
export function activeSpeech(request: {
  lyrics?: { mode: string };
  speech?: SpeechSettings;
}): Exclude<SpeechSettings, { mode: "off" }> | undefined {
  return request.lyrics && request.lyrics.mode !== "off" && request.speech?.mode !== "off"
    ? request.speech
    : undefined;
}

export function speechConfigurationProblem(request: {
  lyrics?: { mode: string };
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
