import { workspaceEntries } from "../../workspace";
import { AssetNeedSchema } from "./asset-needs";
import { z } from "zod";
export const PageProductionSchema = z.object({
  assetNeeds: z.array(AssetNeedSchema).max(6).optional(),
  sourceFile: z.enum(["index.html", workspaceEntries.page]),
  title: z.string().min(1),
  styleRenderer: z.array(z.string()).min(1),
  interactionEngine: z.array(z.string()).min(1),
  interactions: z.array(z.string()).min(1),
  responsiveStrategy: z.string().min(1),
  limitations: z.array(z.string()),
});

import { ContentBriefSchema } from "./content-brief";
export const PageBriefSchema = ContentBriefSchema.extend({
  sections: z.array(z.string()).min(1),
  interactionGoals: z.array(z.string()).min(1),
});
export type PageBrief = z.infer<typeof PageBriefSchema>;

export type PageProduction = z.infer<typeof PageProductionSchema>;
