import type { ErrorCode } from "./errors";
import type { Provider } from "./domains/common";
import { z } from "zod";
import { StyleCombinationsSchema } from "./style-combinations";
import { VideoRequestSchema, type VideoRequest, type VideoGenerationJob } from "./domains/video";
import { PageRequestSchema, type PageRequest, type PageGenerationJob } from "./domains/page";
export { ProviderSchema, type Provider } from "./domains/common";
export { ProductionSchema, type Production } from "./domains/video";
export type { VideoRequest } from "./domains/video";
export type CreativeRequest = VideoRequest | PageRequest;
export type GenerationJob = VideoGenerationJob | PageGenerationJob;
export const RequestSchema = z.union([PageRequestSchema, VideoRequestSchema]);
export const StackEntrySchema = z
  .object({
    name: z.string(),
    purpose: z.string().optional(),
    role: z.string().optional(),
    package: z.string().nullable().optional(),
    production_roles: z.array(z.string()).optional(),
    runtime: z.string().optional(),
    optional: z.boolean().optional(),
    docs_url: z.url().nullable().optional(),
    suggested_apis: z.array(z.string()).optional(),
    integration_guidance: z.string().optional(),
  })
  .passthrough();
export const StyleSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  category: z.string(),
  visual_cues: z.string(),
  note: z.string(),
  provenance: z.string(),
  executable_prompt_template: z.string(),
  palette: z
    .object({
      tokens: z.record(z.string(), z.string()),
      constraints: z.array(z.string()),
      background_policy: z.enum(["scene_dependent", "fixed"]).optional(),
      source_frame_review: z
        .object({
          reviewed_at: z.string(),
          sample_window_seconds: z.tuple([z.literal(1), z.literal(8)]),
          source_review_complete: z.boolean(),
          sampling_limitation: z.string(),
          guidance: z.string(),
          sources: z.array(
            z.object({
              source_url: z.url(),
              observed_seconds: z.array(z.number().int().min(1).max(8)),
              confidence: z.enum(["high", "medium"]),
              style_evidence: z.string(),
              palette_lesson: z.string(),
            }),
          ),
        })
        .optional(),
    })
    .passthrough(),
  audio_direction: z.object({ prompt: z.string() }).passthrough(),
  suggested_combinations: StyleCombinationsSchema.optional(),
  combination_guidance_provenance: z.string().optional(),
  motion_references: z
    .object({
      required: z.boolean().optional(),
      selection_policy: z.string().optional(),
      candidates: z
        .array(z.object({ motion_id: z.string(), usage_guidance: z.string() }))
        .default([]),
      agent_instruction: z.string().optional(),
    })
    .passthrough(),
  tech: z
    .object({
      recommended_stack: z.array(StackEntrySchema),
      implementation: z.string(),
      library_selection: z.string().optional(),
      style_renderer: z.object({ recommended_stack_refs: z.array(z.string()) }).passthrough(),
      motion_engine: z.object({ recommended_stack_refs: z.array(z.string()) }).passthrough(),
      render_pipeline: z.string(),
    })
    .passthrough(),
});
export type Style = z.infer<typeof StyleSchema>;
export { BriefSchema, type Brief } from "./domains/video";
export type ContentBrief = z.infer<typeof import("./domains/content").ContentBriefSchema>;
export {
  ProposalSchema,
  proposalSchemaForStyleRange,
  type Proposal,
} from "./agents/schemas/proposals";
import type { Proposal } from "./agents/schemas/proposals";
export interface StyleCandidate extends Proposal {
  id: string;
  score: number;
  confidence: number;
  dimensions: Record<string, number>;
}
export type { Phase } from "./domains/common";
import type { Phase } from "./domains/common";
export interface AgentProgressEvent {
  id: number;
  runId: string;
  jobId?: string;
  type: string;
  time: string;
  message: string;
  data?: unknown;
}
export const ReferenceScreenshotSchema = z.object({
  name: z.string().regex(/^website-reference-[a-f0-9-]+\.png$/),
  url: z.string().url(),
  title: z.string(),
  text: z.string(),
});
export type ReferenceScreenshot = z.infer<typeof ReferenceScreenshotSchema>;
export type { PreparationStep, PreparationCheckpoint, PreparationState } from "./preparation";
import type { PreparationState } from "./preparation";
export interface Run {
  inputWaits?: import("./input-checkpoint").InputWait[];
  assetQuestions?: import("./asset-requirements-policy").AssetQuestion[];
  id: string;
  request: CreativeRequest;
  phase: Phase;
  createdAt: string;
  brief?: import("./domains/video").Brief | import("./domains/page").PageBrief;
  candidates: StyleCandidate[];
  jobs: GenerationJob[];
  winnerId?: string;
  error?: string;
  errorCode?: ErrorCode;
  rankingModel?: string;
  directionRound?: number;
  directionRounds?: import("./direction-rounds").DirectionRoundRecord[];
  preparation?: PreparationState;
  referenceScreenshots?: ReferenceScreenshot[];
  generatedLyrics?: import("./domains/video").GeneratedLyrics;
}
export interface StyleExample {
  authorship?: "application";
  motionStatus?: "ready" | "needs_repair" | "pending";
  video?: string;
  videoGeneratedAt?: string;
  duration?: number;
  motionDescription?: string;
  selectedMotionReferenceIds?: string[];
  source?: string;
  provider?: Provider;
  model?: string;
  generatedAt?: string;
  designNotes?: string;
  styleId: string;
  catalogHash: string;
  thumbnail: string;
  status: "ready" | "failed";
  error?: string;
}
export interface Asset {
  durationSeconds?: number;
  documentPages?: number;
  id: string;
  name: string;
  path: string;
  kind: string;
  bytes: number;
  originalName?: string;
  sha256?: string;
}
export const terminalPhases = new Set<Phase>(["ready", "failed", "cancelled", "interrupted"]);
export function isRunSettled(run: Run) {
  return terminalPhases.has(run.phase) && run.jobs.every((job) => terminalPhases.has(job.phase));
}
export function dimensions(aspect: string, height: number) {
  return aspect === "9:16"
    ? { width: height, height: Math.round((height * 16) / 9 / 2) * 2 }
    : aspect === "1:1"
      ? { width: height, height }
      : { width: Math.round((height * 16) / 9 / 2) * 2, height };
}

export const MotionPatternSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    description: z.string(),
    motion_sequence: z.array(z.string()),
    video_adaptation: z.string(),
    tech: z
      .object({
        suggested_libraries: z.array(StackEntrySchema).default([]),
        implementation: z.string().optional(),
        library_selection: z.string().optional(),
      })
      .passthrough(),
    compatibility: z.object({
      good_fit: z.array(z.string()),
      adapt_or_omit_when: z.array(z.string()),
    }),
    executable_prompt_template: z.string(),
  })
  .passthrough();
export type MotionPattern = z.infer<typeof MotionPatternSchema>;
