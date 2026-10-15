import { z } from "zod";
export const CandidateCopySchema = z.object({
  displayTitle: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^\s*\S+(?:\s+\S+)?\s*$/u, "Preview names must contain one or two words"),
  displayDescription: z.string().trim().min(1).max(160),
});
