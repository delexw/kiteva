import { z } from "zod";
import { VideoLanguageSchema } from "./video-language";

export const SubtitleProgressSchema = z
  .object({
    language: VideoLanguageSchema,
    completed: z.number().int().min(0),
    total: z.number().int().positive(),
    status: z.enum(["running", "complete", "failed", "stopped"]),
  })
  .refine(
    (value) =>
      value.completed <= value.total &&
      (value.status !== "complete" || value.completed === value.total),
  );
export type SubtitleProgress = z.infer<typeof SubtitleProgressSchema>;
