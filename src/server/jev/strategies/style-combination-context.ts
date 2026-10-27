import type { ContentBrief } from "../../../shared/contracts";

/** Opus synthesizes asset evidence per combination; ranking retains the original content brief. */
export function styleCombinationRankingBrief(brief: ContentBrief) {
  const content = { ...brief };
  delete content.assetPlan;
  return content;
}
