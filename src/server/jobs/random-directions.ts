import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Style, StyleCandidate } from "../../shared/contracts";
import { ProposalSchema } from "../../shared/agents/schemas/proposals";

export const RandomDirectionsSchema = z.object({
  policy: z.literal("uniform-pool-v1"),
  candidates: z
    .array(
      ProposalSchema.shape.options.element.extend({
        id: z.string(),
        score: z.literal(0),
        confidence: z.literal(0),
        dimensions: z.object({}).strict(),
      }),
    )
    .min(1)
    .max(5),
});

/** Uniform draws without replacement; no model shortlist, metrics or compatibility weighting. */
export function randomDirections(
  styles: readonly Style[],
  count: number,
  range: { min: number; max: number },
): z.infer<typeof RandomDirectionsSchema> {
  if (!Number.isInteger(count) || count < 1 || count > 5 || styles.length < count)
    throw Error("Not enough Motion Graphics for the requested random directions");
  const maximum = Math.min(range.max, styles.length);
  if (range.min < 1 || range.min > maximum)
    throw Error("Invalid random Motion Graphic count range");
  const primaryPool = [...styles];
  const draw = (pool: Style[]) => pool.splice(randomInt(pool.length), 1)[0];
  const candidates: StyleCandidate[] = Array.from({ length: count }, (_, directionIndex) => {
    const primary = draw(primaryPool);
    const supportingPool = styles.filter((style) => style.id !== primary.id);
    const size = randomInt(range.min, maximum + 1);
    const selected = [primary, ...Array.from({ length: size - 1 }, () => draw(supportingPool))];
    return {
      id: randomUUID(),
      primaryStyleId: primary.id,
      supportingStyleIds: selected.slice(1).map((style) => style.id),
      sceneRoles: selected.map(
        (style, index) =>
          `${index === 0 ? "Primary identity" : "Supporting contribution"}: ${style.name_en}`,
      ),
      rationale:
        "Uniform random draw from the full Motion Graphic pool. No scoring, weighting, preference history or model ranking. Adapt the brief to this draw while preserving its requirements and one coherent visual identity; do not replace the drawn Motion Graphics through ranking.",
      displayTitle: `Random ${directionIndex + 1}`,
      displayDescription: selected
        .map((style) => style.name_en)
        .join(" + ")
        .slice(0, 160),
      feasible: true,
      missingAssets: [],
      score: 0,
      confidence: 0,
      dimensions: {},
    };
  });
  return RandomDirectionsSchema.parse({ policy: "uniform-pool-v1", candidates });
}
