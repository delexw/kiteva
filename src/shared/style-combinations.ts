/** Original style assignments apply to every preview and full-build route. */
export const requestedStyleScopeGuidance =
  "Every Motion Graphic explicitly named in the requested idea is required even when absent from Settings; implement it in the requested scope, whether the whole video, an act or a scene. It is not an alternative to reject. Do not move a style assigned to a later act or scene into an earlier preview. Do not suggest or rank unrequested alternative Motion Graphics.";

export const combinationProposalPolicyRevision = 5;
/** Automatic proposal route only; do not include quota guidance in explicit-style builds. */
export const suggestedCombinationGuidance = `Suggested combinations are compatibility hints, not an allowlist, an exhaustive list, or a rule. The number of suggestion rows or Motion Graphics in a suggested pairing does not limit the permitted combination size. The duration-derived range limits the automatically generated candidate combination, not the total styles in the film; additional styles explicitly assigned in the prompt are outside that range. If a larger combination helps the brief, extend a suggested pairing with compatible Motion Graphics from the full catalog, or propose a different combination entirely. Treat the recommendations as a soft preference: an illustrative 60:40 balance of attention to suggested-compatible ideas versus other compatible ideas, not fixed scoring weights, a quota, or guaranteed selection. Adjust that balance to the brief; no suggestions does not mean no compatible combinations. Explain which recommendations were adapted, why any unlisted supporting Motion Graphics fit, and the meaningful role of every Motion Graphic. Preserve the primary identity and palette, coherent materials, readable pacing, and honest asset feasibility. Do not pad to the maximum or penalize a combination merely because it is not suggested.`;

export {
  MAX_SUPPORTING_STYLES,
  StyleCombinationSchema,
  StyleCombinationsSchema,
  CombinationReviewSchema,
  type StyleCombinations,
} from "./agents/schemas/style-combinations";
import { CombinationReviewSchema } from "./agents/schemas/style-combinations";

export function validateCombinationReview(
  input: unknown,
  expectedIds: string[],
  catalogIds: string[],
) {
  const review = CombinationReviewSchema.parse(input);
  const ids = review.styles.map((style) => style.style_id);
  if (
    ids.length !== expectedIds.length ||
    new Set(ids).size !== ids.length ||
    expectedIds.some((id) => !ids.includes(id))
  )
    throw Error("Combination review must cover each requested Motion Graphic exactly once");
  const known = new Set(catalogIds);
  for (const style of review.styles) {
    const signatures = new Set<string>();
    for (const suggestion of style.suggested_combinations.suggestions) {
      const supporting = suggestion.supporting_styles.map((item) => item.style_id);
      if (
        supporting.some((id) => !known.has(id) || id === style.style_id) ||
        new Set(supporting).size !== supporting.length
      )
        throw Error(`Invalid supporting Motion Graphics for ${style.style_id}`);
      const signature = [...supporting].sort().join("|");
      if (signatures.has(signature)) throw Error(`Duplicate combination for ${style.style_id}`);
      signatures.add(signature);
    }
  }
  return review;
}
