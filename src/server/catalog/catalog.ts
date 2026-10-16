import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { StyleSchema, MotionPatternSchema } from "../../shared/contracts.js";
import { catalogRoot } from "../runtime/config.js";
import { validateCombinationReview } from "../../shared/style-combinations";
import {
  resolveStyleTechnology,
  styleTechnologyRecommendations,
} from "../../shared/style-technology";
export async function loadCatalog() {
  const raw = await readFile(path.join(catalogRoot, "video-style-catalog.json"), "utf8");
  const source = JSON.parse(raw);
  const resolvedStyles = source.styles.map((style: Record<string, unknown>) => ({
    ...style,
    tech: resolveStyleTechnology(style.tech as Record<string, unknown>),
  }));
  const styles = z
    .object({
      styles: z.array(StyleSchema),
      production_policy: z.object({}).passthrough(),
      combination_analysis: z
        .object({
          model: z.string(),
          source_hash: z.string(),
          analyzed_at: z.string(),
          guidance: z.string(),
        })
        .optional(),
    })
    .passthrough()
    .parse({ ...source, styles: resolvedStyles });
  const motion = z
    .object({ patterns: z.array(MotionPatternSchema) })
    .passthrough()
    .parse(
      JSON.parse(await readFile(path.join(catalogRoot, "motion-pattern-catalog.json"), "utf8")),
    );
  const ids = new Set(motion.patterns.map((m) => m.id));
  const reviewedStyles = styles.styles.filter((style) => style.suggested_combinations);
  validateCombinationReview(
    {
      styles: reviewedStyles.map((style) => ({
        style_id: style.id,
        suggested_combinations: style.suggested_combinations,
      })),
    },
    reviewedStyles.map((style) => style.id),
    styles.styles.map((style) => style.id),
  );
  for (const style of styles.styles) {
    const candidates = z
      .array(z.object({ motion_id: z.string(), usage_guidance: z.string() }).passthrough())
      .parse(style.motion_references.candidates);
    if (new Set(candidates.map((candidate) => candidate.motion_id)).size !== candidates.length)
      throw Error(`Duplicate motion reference for ${style.id}`);
    for (const candidate of candidates)
      if (!ids.has(candidate.motion_id)) throw Error(`Unknown motion ${candidate.motion_id}`);
  }
  return {
    ...styles,
    styles: styles.styles.map((style) => ({
      ...style,
      tech: styleTechnologyRecommendations(style.tech),
    })),
    originalStyles: resolvedStyles as Record<string, unknown>[],
    motions: motion.patterns,
    hash: createHash("sha256").update(raw).digest("hex"),
  };
}
export type Catalog = Awaited<ReturnType<typeof loadCatalog>>;
