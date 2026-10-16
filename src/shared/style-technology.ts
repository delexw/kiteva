import { z } from "zod";
import { technologyPool, type TechnologyDefinition, type TechnologyKey } from "./technology-pool";
import type { Style } from "./contracts";

const projectRendererTools = new Set([
  "HyperFrames",
  "Remotion",
  "@remotion/renderer",
  "Multiplane",
]);
export function styleTechnologyRecommendations(tech: Style["tech"]): Style["tech"] {
  return {
    ...tech,
    recommended_stack: tech.recommended_stack.filter(
      (tool) => !projectRendererTools.has(tool.name),
    ),
    ...(Array.isArray(tech.alternatives)
      ? {
          alternatives: tech.alternatives.filter(
            (name) => typeof name !== "string" || !projectRendererTools.has(name),
          ),
        }
      : {}),
    render_pipeline:
      "Uses the project's renderer setting. Style recommendations select visual and motion tools, not the composition or export framework.",
    framework_selection: {
      source: "project.renderer",
      scope: "Composition and export follow the project setting.",
    },
    library_selection:
      "Choose visual, motion and supporting tools for the style, scene, assets and required fidelity. Use one owner for each animated property and deterministic seekable time. Composition and export follow the project's renderer setting; style suggestions do not override it.",
  };
}

const TechnologyReferencesSchema = z
  .object({
    recommended_stack_keys: z.array(z.string()),
    stack_overrides: z
      .record(
        z.string(),
        z.object({
          values: z.record(z.string(), z.unknown()),
          remove: z.array(z.string()),
        }),
      )
      .default({}),
    stack_property_order: z.record(z.string(), z.array(z.string())).default({}),
  })
  .passthrough();

export function resolveStyleTechnology(tech: Record<string, unknown>): Record<string, unknown> {
  if (!("recommended_stack_keys" in tech)) return tech;
  const refs = TechnologyReferencesSchema.parse(tech);
  if (new Set(refs.recommended_stack_keys).size !== refs.recommended_stack_keys.length)
    throw Error("Duplicate technology reference");
  for (const key of [
    ...Object.keys(refs.stack_overrides),
    ...Object.keys(refs.stack_property_order),
  ]) {
    if (!refs.recommended_stack_keys.includes(key))
      throw Error(`Unused technology override: ${key}`);
  }
  const entries = refs.recommended_stack_keys.map((key) => {
    if (!Object.hasOwn(technologyPool, key)) throw Error(`Unknown technology key: ${key}`);
    const entry: TechnologyDefinition = structuredClone(technologyPool[key as TechnologyKey]);
    const override = refs.stack_overrides[key];
    for (const property of override?.remove || []) delete entry[property];
    Object.assign(entry, override?.values);
    const order = refs.stack_property_order[key];
    if (!order) return entry;
    if (
      new Set(order).size !== order.length ||
      order.length !== Object.keys(entry).length ||
      order.some((property) => !(property in entry))
    )
      throw Error(`Invalid technology property order: ${key}`);
    return Object.fromEntries(order.map((property) => [property, entry[property]]));
  });
  return Object.fromEntries(
    Object.entries(tech).flatMap(([key, value]) => {
      if (["stack_overrides", "stack_property_order"].includes(key)) return [];
      return [
        [
          key === "recommended_stack_keys" ? "recommended_stack" : key,
          key === "recommended_stack_keys" ? entries : value,
        ],
      ];
    }),
  );
}
