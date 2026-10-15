import { z } from "zod";
const pose = z.object({
  x: z.number().min(-48).max(48),
  y: z.number().min(-48).max(48),
  scale: z.number().min(0.65).max(1.25),
  rotation: z.number().min(-15).max(15),
  opacity: z.number().min(0).max(1),
});
export const IllustrationMotionSchema = z.object({
  styleId: z.string().regex(/^style-\d{3}$/),
  selectedReferenceIds: z.array(z.string().regex(/^motion-\d{3}$/)).max(2),
  rationale: z.string().max(1400),
  tracks: z
    .array(
      z.object({
        actorId: z.string().regex(/^demo-actor-\d+$/),
        role: z.string().max(160),
        action: z.enum(["transform", "reveal", "draw"]).default("transform"),
        start: z.number().min(0).max(1.8),
        duration: z.number().min(0.2).max(0.8),
        ease: z.enum(["sine.inOut", "power2.inOut", "back.out(1.2)", "steps(6)"]),
        pose,
      }),
    )
    .min(1)
    .max(10),
});
export const IllustrationMotionsSchema = z.object({
  plans: z.array(IllustrationMotionSchema).min(1).max(5),
});
export type IllustrationMotion = z.infer<typeof IllustrationMotionSchema>;
