/** Original style assignments apply to every preview and full-build route. */
export const requestedStyleScopeGuidance =
  "Every Motion Graphic explicitly named in the requested idea is required even when absent from Settings; implement it in the requested scope, whether the whole video, an act or a scene. It is not an alternative to reject. Do not move a style assigned to a later act or scene into an earlier preview. Do not suggest or rank unrequested alternative Motion Graphics.";

/** Settings select the available languages; the planner derives emphasis from the user's idea. */
export const selectedStyleWeightingGuidance =
  "IDEA-LED MOTION GRAPHIC WEIGHTING: Selection order does not determine importance. For every Settings-selected Motion Graphic, derive its role and relative creative emphasis from the original idea, audience, narrative purpose, source evidence and canonical definition. Honour explicit user weights and scene scopes; use equal weight only when requested or justified by the idea. Otherwise choose and explain an appropriate balance, giving every selected Motion Graphic a meaningful contribution. Record each style ID, role, approximate percentage of creative emphasis and idea-based justification in sceneRoles when proposing an execution; the percentages across the selected styles must total 100. These are creative emphasis weights, not fixed screen-time quotas or a requirement to use every style in every scene. The schema's primaryStyleId and supportingStyleIds are compatibility groupings for Settings-selected styles, not priority assignments; never infer visual dominance from those fields. When building directly without previews, decide and document the balance during planning. For an approved execution, carry its justified balance into the storyboard and production, adapting it only when the idea, feedback or observed evidence warrants a change. Preserve each style's requested scope and leave individual scene composition and motion to the main planner.";

export const combinationProposalPolicyRevision = 7;
export const combinationAssetEvidenceGuidance =
  "Include an Asset evidence section in every complete combination rationale: synthesize relevant asset coverage, suitability and all applicable limitations from the full brief and assetPlan. Distinguish verified, unavailable and unknown inputs; explain their effect on this combination without inventing evidence. JEV receives this synthesis, not a separate asset evidence map.";
export const compactDirectionProposalGuidance = `Keep decision data concise: at most 120 words for each rationale and one short sentence per style role. Explain the creative approach, meaningful contributions, tradeoffs and adaptation without repeating catalog definitions, the brief, source documents or shared requirements. Reference Motion Graphics by ID. ${combinationAssetEvidenceGuidance}`;
/** Automatic proposal route only; do not include quota guidance in explicit-style builds. */
export const suggestedCombinationGuidance = `Suggested combinations are compatibility hints, not an allowlist, an exhaustive list, or a rule. The number of suggestion rows or Motion Graphics in a suggested pairing does not limit the permitted combination size. The duration-derived range limits the automatically generated candidate combination, not the total styles in the film; additional styles explicitly assigned in the prompt are outside that range. Explore the full permitted range openly, including richer combinations. Treat suggested pairings as starting points: actively consider additional compatible Motion Graphics from the full catalog when they strengthen the explanation, storytelling or visual expression. Treat the recommendations as a soft preference: an illustrative 60:40 balance of attention to suggested-compatible ideas versus other compatible ideas, not fixed scoring weights, a quota, or guaranteed selection. Adjust that balance to the brief; no suggestions does not mean no compatible combinations. Explain which recommendations were adapted, why any unlisted supporting Motion Graphics fit, and the meaningful role of every Motion Graphic. Preserve the primary identity and palette, coherent materials, readable pacing, and honest asset feasibility. Choose the combination size for its creative value, without defaulting to the smallest familiar pairing or penalizing larger or unlisted combinations merely for their size or novelty.`;

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
