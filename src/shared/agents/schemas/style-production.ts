import { z } from "zod";
import type { Style } from "../../contracts";
import { ProductionSchema } from "./video";
export function reviewedStyleProductionSchema(style: Style) {
  const renderers = style.tech.style_renderer.recommended_stack_refs;
  const motion = style.tech.motion_engine.recommended_stack_refs;
  if (!renderers.length || !motion.length)
    throw Error("Reviewed Motion Graphic needs rendering and motion owners");
  return ProductionSchema.omit({ displayTitle: true, displayDescription: true }).extend({
    pipeline: z.literal("HyperFrames"),
    sourceFile: z.literal("index.html"),
    duration: z.literal(3),
    width: z.literal(1280),
    height: z.literal(720),
    styleRenderer: z.array(z.enum(renderers as [string, ...string[]])).min(1),
    motionEngine: z.array(z.enum(motion as [string, ...string[]])).min(1),
  });
}
