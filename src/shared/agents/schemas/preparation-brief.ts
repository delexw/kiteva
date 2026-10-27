import { z } from "zod";
import type { CreativeRequest } from "../../contracts";
import { ContentBriefSchema } from "./content-brief";
import { BriefSchema } from "./video";
import { PageBriefSchema } from "./page";

/** Model-owned interpretation only; request copy, inventory and explicit settings stay app-owned. */
export const PreparationContentSchema = ContentBriefSchema.pick({
  subject: true,
  audience: true,
  objective: true,
  previewBeat: true,
}).extend({
  subject: z.string().min(1).max(120).describe("Short idea title, not a scene list."),
  audience: z.string().min(1).max(300),
  objective: z.string().min(1).max(500),
  previewBeat: z
    .string()
    .min(1)
    .max(400)
    .describe("One representative narrative action; no production plan."),
  facts: z
    .array(z.string().min(1).max(400))
    .max(6)
    .describe(
      "Only concise relevant observations verified from sources. Do not repeat the request, exact copy, settings or source inventory. Empty is valid.",
    ),
  constraints: z
    .array(z.string().min(1).max(300))
    .max(4)
    .describe(
      "Only genuine inferred assumptions, conflicts or access limitations. Do not repeat user instructions or settings. Empty is valid.",
    ),
  assetNeeds: ContentBriefSchema.shape.assetNeeds,
});

export function preparationBriefSchemaFor(request: CreativeRequest) {
  if (request.outputType === "page")
    return PreparationContentSchema.extend({
      sections: PageBriefSchema.shape.sections,
      interactionGoals: PageBriefSchema.shape.interactionGoals,
    });
  if (request.duration === "auto")
    return PreparationContentSchema.extend({
      suggestedDuration: BriefSchema.shape.suggestedDuration,
      durationReason: z.string().min(1).max(300),
    });
  return PreparationContentSchema;
}

export const preparationOutputGuidance = `COMPACT PREPARATION OUTPUT: Return only the fields in the supplied schema. Keep facts to at most six concise verified observations, constraints to at most four genuine assumptions or limitations, and previewBeat to one narrative action. Do not reproduce the original prompt, scene-by-scene plan, subtitles, narration, exact copy, settings, inventory or full exploration reports. These remain authoritative in input.json and source manifests for the main model and independent evidence review. References above to full-brief assetDescriptions/exactCopy fields describe downstream evidence responsibilities, not fields to return here. Kiteva assembles those fields from original data; do not invent replacements. When duration fields are absent, the application owns the explicit requested duration. When present, suggest duration only for Auto. Use native JSON arrays for facts and constraints, not serialized strings. No implementation or video generation during preparation.`;
