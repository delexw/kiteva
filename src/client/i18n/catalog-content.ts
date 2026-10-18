import type { MotionPattern, StackEntrySchema, Style, StyleExample } from "../../shared/contracts";
import type { z } from "zod";
import { motionGraphicVariantPolicy, motionVariantPolicy } from "../../shared/catalog-variants";

type StackEntry = z.infer<typeof StackEntrySchema>;
/** The catalog's human-readable presentation fields; executable source and IDs are excluded. */
export class CatalogDisplayText {
  private readonly values = new Set<string>();

  add(...values: Array<string | readonly string[] | undefined>) {
    for (const value of values) {
      const entries = typeof value === "string" ? [value] : (value ?? []);
      for (const entry of entries) if (entry.trim()) this.values.add(entry);
    }
    return this;
  }

  stack(libraries: readonly StackEntry[]) {
    for (const library of libraries)
      this.add(library.name, library.purpose, library.runtime, library.integration_guidance);
    return this;
  }

  style(style: Style) {
    this.add(
      style.name_en,
      style.category,
      style.visual_cues,
      style.palette.constraints,
      Object.keys(style.palette.tokens).map((key) => key.replaceAll("_", " ").replaceAll("-", " ")),
      style.audio_direction.prompt,
      style.tech.implementation,
      style.tech.library_selection,
    );
    this.stack(style.tech.recommended_stack);
    this.add(
      style.tech.style_renderer?.recommended_stack_refs,
      style.tech.motion_engine?.recommended_stack_refs,
    );
    this.add(style.motion_references.selection_policy, style.motion_references.agent_instruction);
    for (const reference of style.motion_references.candidates) this.add(reference.usage_guidance);
    for (const variant of style.motion_graphic_variants ?? []) {
      this.add(
        motionGraphicVariantPolicy,
        variant.name,
        variant.summary,
        variant.use_when,
        variant.visual_guidance,
        variant.animation_guidance,
        variant.palette_guidance,
        variant.illustrative_swatches.map((swatch) => swatch.role),
      );
    }
    const combinations = style.suggested_combinations;
    if (combinations) {
      this.add(combinations.selection_guidance);
      for (const suggestion of combinations.suggestions) {
        this.add(
          suggestion.rationale,
          suggestion.best_for,
          suggestion.video_application,
          suggestion.html_application,
          suggestion.consistency_rules,
          suggestion.avoid,
        );
        for (const supporting of suggestion.supporting_styles) this.add(supporting.role);
      }
    }
    return this;
  }

  motion(motion: MotionPattern) {
    this.add(
      motion.name,
      motion.category,
      motion.description,
      motion.motion_sequence,
      motion.video_adaptation,
      motion.compatibility.good_fit,
      motion.compatibility.adapt_or_omit_when,
      motion.tech.implementation,
      motion.tech.library_selection,
    );
    this.stack(motion.tech.suggested_libraries);
    for (const variant of motion.variants ?? [])
      this.add(motionVariantPolicy, variant.name, variant.summary, variant.motion_sequence);
    return this;
  }

  example(example: Pick<StyleExample, "designNotes" | "motionDescription">) {
    return this.add(example.designNotes, example.motionDescription);
  }

  texts() {
    return [...this.values];
  }
}
