import { z } from "zod";
import { videoGenerationOutputSchemaForDuration } from "./video";

export const VideoCorrectionOutcomeSchema = z.object({
  status: z.enum(["fixed", "refused", "unresolved"]),
  reason: z.string().trim().min(1),
});
export type VideoCorrectionOutcome = z.infer<typeof VideoCorrectionOutcomeSchema>;

/** A declined repair needs no replacement manifest or storyboard. */
export function videoCorrectionOutputSchemaForDuration(duration: number) {
  return videoGenerationOutputSchemaForDuration(duration).partial().extend({
    correctionOutcome: VideoCorrectionOutcomeSchema,
  });
}

export type VideoCorrectionBypass = {
  issueKey: string;
  finding?: unknown;
  decisions: Array<{ model: string; outcome: VideoCorrectionOutcome }>;
};
