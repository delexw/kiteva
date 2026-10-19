import { CreativeApproachSchema } from "../creative-approach";
import { MAX_VIDEO_STYLE_COUNT } from "../style-selection";
import { type ResultReview } from "../agents/schemas/result-review";
import type { ErrorCode } from "../errors";

import { z } from "zod";
import { BriefRequirementsSchema } from "../brief-sections";
export const ProviderSchema = z.enum(["codex", "claude"]);
export type Provider = z.infer<typeof ProviderSchema>;
export const SharedRequestSchema = z.object({
  requirements: BriefRequirementsSchema.optional(),
  instructions: z.string().trim().min(8).max(24000),
  assetIds: z.array(z.string().uuid()).max(20).default([]),
  urls: z.array(z.url()).max(5).default([]),
  preference: CreativeApproachSchema.default("context"),
  provider: ProviderSchema.default("codex"),
  mainModel: z.string().trim().min(1).optional(),
  candidateCount: z.number().int().min(0).max(5).default(5),
  selectedStyleIds: z
    .array(z.string().regex(/^style-\d{3}$/))
    .max(MAX_VIDEO_STYLE_COUNT)
    .optional(),
  pinnedStyleId: z
    .string()
    .regex(/^style-\d{3}$/)
    .optional(),
});

export interface JobState {
  id: string;
  runId: string;
  candidateId: string;
  kind: "preview" | "full";
  phase: Phase;
  workspace: string;
  sessionId?: string;
  sourceJobId?: string;
  refinementPrompt?: string;
  model: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  generationMs?: number;
  renderMs?: number;
  error?: string;
  errorCode?: ErrorCode;
  resultReview?: ResultReview;
}

export type Phase =
  | "queued"
  | "preparing"
  | "ranking"
  | "generating"
  | "validating"
  | "rendering"
  | "ready"
  | "failed"
  | "cancelled"
  | "interrupted";
