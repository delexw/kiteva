import { validateStyleSelection } from "../style-selection";
import { z } from "zod";
import { SharedRequestSchema } from "./common";
import type { JobState } from "./common";
export const PageRequestSchema = SharedRequestSchema.extend({
  outputType: z.literal("page"),
  viewport: z.enum(["desktop", "mobile"]).default("desktop"),
  duration: z.never().optional(),
  aspectRatio: z.never().optional(),
  subtitles: z.never().optional(),
  speech: z.never().optional(),
}).superRefine(validateStyleSelection);
export type PageRequest = z.infer<typeof PageRequestSchema>;
export { PageProductionSchema } from "../agents/schemas/page";
export type { PageProduction } from "../agents/schemas/page";
import type { PageProduction } from "../agents/schemas/page";
export interface PageGenerationJob extends JobState {
  outputType: "page";
  video?: never;
  viewingVideo?: never;
  cardClip?: never;
  playbackCopies?: never;
  poster?: string;
  duration?: never;
  production?: never;
  page?: string;
  pageProduction?: PageProduction;
  validationMs?: number;
}

export { PageBriefSchema, type PageBrief } from "../agents/schemas/page";
