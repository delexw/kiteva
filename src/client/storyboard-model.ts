import { z } from "zod";
import { StoryboardBeatSchema, StoryboardSceneSchema } from "../shared/agents/schemas/storyboard";
const textList = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (typeof value === "string" ? (value ? [value] : []) : value));
const time = z.number().finite().nonnegative();
const beatSchema = StoryboardBeatSchema.partial().extend({
  startSeconds: time.optional(),
  endSeconds: time.optional(),
  development: z.string().default(""),
  captions: textList.default([]),
  readingHoldSeconds: time.optional(),
  audio: z
    .object({
      music: textList.default([]),
      effects: textList.default([]),
      lyrics: textList.default([]),
    })
    .default({ music: [], effects: [], lyrics: [] }),
});
const sceneSchema = StoryboardSceneSchema.partial().extend({
  id: z.string().optional(),
  title: z.string().default(""),
  purpose: z.string().default(""),
  startSeconds: time.optional(),
  endSeconds: time.optional(),
  visuals: textList.default([]),
  assets: textList.default([]),
  beats: z.array(beatSchema).default([]),
});
export const storyboardPageSchema = z.object({
  title: z.string().default("Storyboard"),
  durationSeconds: time,
  scenes: z.array(sceneSchema).default([]),
  sections: z
    .array(
      z.object({
        heading: z.string().nullable().optional(),
        blocks: z.array(z.unknown()).default([]),
      }),
    )
    .default([]),
  notes: textList.default([]),
});
export type MangaStoryboard = z.infer<typeof storyboardPageSchema>;
export type MangaScene = MangaStoryboard["scenes"][number];
export function storyboardTime(seconds?: number) {
  if (seconds === undefined) return "Time not specified";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${minutes}:${remaining.toFixed(Number.isInteger(remaining) ? 0 : 1).padStart(Number.isInteger(remaining) ? 2 : 4, "0")}`;
}
export function storyboardAssetPath(reference: string) {
  const match = reference.match(
    /\bassets\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(?:png|jpe?g|webp|gif)(?=$|[\s),])/i,
  );
  return match?.[0];
}
