import { z } from "zod";
import { SpeechSettingsSchema, SpeechTrackSchema } from "./speech";

export const narrationStatePath = "audio/narration.json";
export const narrationConfigPath = "audio/narration-config.json";
export const NarrationConfigSchema = z.object({
  duration: z.number().positive().max(300),
  profiles: z.record(z.string(), SpeechSettingsSchema),
});
export type NarrationConfig = z.infer<typeof NarrationConfigSchema>;
export const NarrationCueSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(8000),
  startSeconds: z.number().finite().min(0),
  scriptItemId: z.string().optional(),
  showSubtitles: z.boolean().default(true),
});
export const CreateNarrationSchema = z.object({
  expectedRevision: z.string().optional(),
  cues: z.array(NarrationCueSchema).min(1).max(80),
});
export const EditNarrationSchema = z.object({
  expectedRevision: z.string().min(1),
  edits: z
    .array(
      z
        .object({
          id: z.string().min(1),
          text: z.string().trim().min(1).max(8000).optional(),
          startSeconds: z.number().finite().min(0).optional(),
        })
        .refine(
          (edit) => edit.text !== undefined || edit.startSeconds !== undefined,
          "Provide text or startSeconds",
        ),
    )
    .min(1)
    .max(80),
});
export const NarrationSegmentSchema = NarrationCueSchema.extend({
  file: z.string().min(1),
  sourceStartSeconds: z.number().finite().min(0),
  durationSeconds: z.number().finite().positive(),
});
export const NarrationStateSchema = z.object({
  revision: z.string().min(1),
  track: SpeechTrackSchema,
  segments: z.array(NarrationSegmentSchema).min(1).max(80),
});
export type NarrationState = z.infer<typeof NarrationStateSchema>;
export type NarrationToolResult =
  | { kind: "narration"; action: "created" | "edited"; statePath: string; state: NarrationState }
  | { kind: "error"; message: string };
