import path from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { CaptureChapterSchema } from "../../../../shared/capture-chapters";
import { ChapterCaptureExportSchema, WebsiteRecordingSchema } from "../website-capture";

export const capturedChaptersArtifact = "CAPTURED_CHAPTERS.json";
const text = z.string().trim().min(1);
export const ChapterResultSchema = z.object({
  assetPath: WebsiteRecordingSchema.shape.assetPath,
  // Optional for historical checkpoints; new handoffs include the measured duration.
  actualDurationSeconds: z.number().finite().positive().optional(),
  observedResults: z.array(text).min(1),
  omissions: z.array(text),
  reviewNotes: text,
});
export const ChapterCaptureResponseSchema = z.object({
  outcome: z.union([
    ChapterResultSchema,
    z.object({ captureFailure: z.object({ reason: text }) }),
    z.object({
      timingConflict: z.object({
        requiredDurationSeconds: z.number().finite().positive(),
        reason: text,
      }),
    }),
  ]),
});
export const SavedChapterSchema = z.object({
  chapter: CaptureChapterSchema,
  sessionId: text.optional(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  // Older checkpoints can be read, but must be recaptured before reuse.
  cursorSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  result: ChapterResultSchema,
  evidence: ChapterCaptureExportSchema,
});
export const SavedCapturesSchema = z.object({
  version: z.literal(1),
  scope: text,
  story: text,
  chapters: z.array(SavedChapterSchema),
});

/** Saved results are the explicit bridge between chapter sessions and film production. */
export async function readCapturedChapters(workspace: string) {
  return SavedCapturesSchema.parse(
    JSON.parse(await readFile(path.join(workspace, capturedChaptersArtifact), "utf8")),
  );
}
