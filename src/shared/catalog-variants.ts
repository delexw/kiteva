import type { MotionGraphicVariant, MotionVariant } from "./contracts";

/** Shown wherever variants are listed so the default Motion Graphic look stays primary. */
export const motionGraphicVariantPolicy =
  "Optional named variants of this Motion Graphic. The default visual direction and palette remain the baseline; use a variant only when the brief, subject and any approved palette fit it. Variant swatches are illustrative, never binding, and task-provided or approved colors always win.";

export const motionVariantPolicy =
  "Optional source-observed mechanisms for this motion. The motion's own description and sequence remain the default; choose at most the variant that serves the beat.";

type VariantOwner = {
  id: string;
  motion_graphic_variants?: MotionGraphicVariant[];
};
type MotionOwner = { id: string; variants?: MotionVariant[] };

/** Reject duplicate variant IDs within one entry and pairings with unknown motions. */
export function validateCatalogVariants(styles: VariantOwner[], motions: MotionOwner[]) {
  const motionIds = new Set(motions.map((motion) => motion.id));
  for (const style of styles) {
    const variants = style.motion_graphic_variants ?? [];
    if (new Set(variants.map((variant) => variant.id)).size !== variants.length)
      throw Error(`Duplicate Motion Graphic variant for ${style.id}`);
    for (const variant of variants)
      for (const motionId of variant.paired_motion_ids)
        if (!motionIds.has(motionId))
          throw Error(`Unknown motion ${motionId} paired with ${style.id}/${variant.id}`);
  }
  for (const motion of motions) {
    const variants = motion.variants ?? [];
    if (new Set(variants.map((variant) => variant.id)).size !== variants.length)
      throw Error(`Duplicate motion variant for ${motion.id}`);
  }
}

/**
 * Video style-context entry: unchanged style metadata plus, only when variants exist,
 * the selection policy and concise per-variant guidance for the generating agent.
 */
export function withMotionGraphicVariantPolicy<T extends VariantOwner>(style: T) {
  const variants = style.motion_graphic_variants ?? [];
  if (!variants.length) return style;
  return {
    ...style,
    motion_graphic_variant_policy: motionGraphicVariantPolicy,
    motion_graphic_variant_guidance: variants.map((variant) => ({
      id: variant.id,
      guidance: motionGraphicVariantGuidance(variant),
    })),
  };
}

/** Concise agent-facing guidance for one Motion Graphic variant. */
export function motionGraphicVariantGuidance(variant: MotionGraphicVariant) {
  return [
    `${variant.name} (optional variant): ${variant.summary}`,
    `Use when: ${variant.use_when}`,
    `Visual: ${variant.visual_guidance.join(" ")}`,
    `Animation: ${variant.animation_guidance.join(" ")}`,
    `Palette: ${variant.palette_guidance}`,
    variant.paired_motion_ids.length ? `Pairs with: ${variant.paired_motion_ids.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
