import { z } from "zod";
import { StoryboardSchema } from "./storyboard";
const text = z.string().trim().min(1);
const seconds = z.number().finite().nonnegative();
const interval = { startSeconds: seconds, endSeconds: seconds };
const PlanSchema = z.object({
  version: z.literal(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  storyboard: StoryboardSchema,
  assets: z.array(z.object({ path: text, preparation: text })),
  sceneGuidance: z
    .array(
      z.object({
        sceneId: text,
        composition: text,
        camera: text,
        layers: z
          .array(z.object({ id: text, role: text, appearance: text, placement: text }))
          .min(1),
        motions: z.array(
          z.object({
            targetLayerId: text,
            property: text,
            from: text,
            to: text,
            ...interval,
            easing: text,
            implementation: text,
          }),
        ),
        transition: z.object({ ...interval, description: text }),
        readingHolds: z.array(
          z.object({ ...interval, textLayerIds: z.array(text).min(1), reason: text }),
        ),
        audioCues: z.array(
          z.object({
            ...interval,
            kind: z.enum(["music", "effect", "speech", "silence"]),
            direction: text,
            source: text,
          }),
        ),
        verification: z.array(text).min(1),
      }),
    )
    .min(1),
  tools: z.array(z.object({ name: text, responsibility: text })).min(1),
  acceptanceChecks: z.array(text).min(1),
});
export type VideoBuildPlan = z.infer<typeof PlanSchema>;
export function videoBuildPlanSchemaFor(expected: {
  duration: number;
  width: number;
  height: number;
  fps: number;
}) {
  return PlanSchema.extend({
    width: z.literal(expected.width),
    height: z.literal(expected.height),
    fps: z.literal(expected.fps),
    storyboard: StoryboardSchema.safeExtend({ durationSeconds: z.literal(expected.duration) }),
  }).superRefine((plan, context) => {
    const issue = (path: (string | number)[], message: string) =>
      context.addIssue({ code: "custom", path, message });
    const seen = new Set<string>();
    plan.sceneGuidance.forEach((guidance, index) => {
      const prefix = ["sceneGuidance", index];
      const scene = plan.storyboard.scenes.find((entry) => entry.id === guidance.sceneId);
      if (!scene || seen.has(guidance.sceneId)) {
        issue([...prefix, "sceneId"], "Each storyboard scene needs exactly one guidance entry");
        return;
      }
      seen.add(guidance.sceneId);
      const layers = new Set(guidance.layers.map((layer) => layer.id));
      if (layers.size !== guidance.layers.length)
        issue([...prefix, "layers"], "Layer IDs must be unique within a scene");
      const bounded = (
        item: { startSeconds: number; endSeconds: number },
        path: (string | number)[],
        allowInstant = false,
      ) => {
        if (
          item.startSeconds < scene.startSeconds ||
          item.endSeconds > scene.endSeconds ||
          (allowInstant
            ? item.endSeconds < item.startSeconds
            : item.endSeconds <= item.startSeconds)
        )
          issue(path, "Timing must lie within its scene and have a valid duration");
      };
      guidance.motions.forEach((motion, i) => {
        bounded(motion, [...prefix, "motions", i]);
        if (!layers.has(motion.targetLayerId))
          issue([...prefix, "motions", i, "targetLayerId"], "Motion must target a declared layer");
      });
      bounded(guidance.transition, [...prefix, "transition"], true);
      guidance.readingHolds.forEach((hold, i) => {
        bounded(hold, [...prefix, "readingHolds", i]);
        if (hold.textLayerIds.some((id) => !layers.has(id)))
          issue(
            [...prefix, "readingHolds", i, "textLayerIds"],
            "Reading holds must refer to declared layers",
          );
      });
      guidance.audioCues.forEach((cue, i) => bounded(cue, [...prefix, "audioCues", i]));
    });
    if (seen.size !== plan.storyboard.scenes.length)
      issue(["sceneGuidance"], "Guidance must cover every storyboard scene");
  });
}
