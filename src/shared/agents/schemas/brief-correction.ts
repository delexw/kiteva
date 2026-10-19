import { z } from "zod";

const index = "(?:0|[1-9][0-9]*)";
const textArray = `(?:facts|exactCopy|assetDescriptions|constraints|sections|interactionGoals|assetPlan/limitations|assetPlan/scenes/${index}/assetPaths|assetPlan/assets/${index}/sceneIds)`;
const scalarPath = z
  .string()
  .regex(
    new RegExp(
      `^/(?:subject|audience|objective|previewBeat|suggestedDuration|durationReason|${textArray}/${index}|assetPlan/coreIdea|assetPlan/scenes/${index}/(?:purpose|use|coverage|limitation)|assetPlan/assets/${index}/(?:observedContent|relevance|suitability|plannedUse|limitation))$`,
    ),
  );
const scalar = z.union([z.string(), z.number()]);

/** Leaf edits only: full briefs, arrays, source identities and settings cannot be replaced. */
export const BriefCorrectionSchema = z
  .object({
    edits: z
      .array(
        z.discriminatedUnion("op", [
          z
            .object({ op: z.literal("replace"), path: scalarPath, expected: scalar, value: scalar })
            .strict(),
          z
            .object({
              op: z.literal("remove"),
              path: z.string().regex(new RegExp(`^/${textArray}/${index}$`)),
              expected: z.string(),
            })
            .strict(),
          z
            .object({
              op: z.literal("add"),
              path: z.string().regex(new RegExp(`^/${textArray}/(?:${index}|-)$`)),
              value: z.string(),
            })
            .strict(),
        ]),
      )
      .min(1),
  })
  .strict();

export type BriefCorrection = z.infer<typeof BriefCorrectionSchema>;
