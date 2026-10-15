import { z } from "zod";
const seconds = z.number().finite().nonnegative();
const strings = z.array(z.string());
const audioText = z.union([z.string(), strings]);
export const StoryboardBeatSchema = z.object({
  startSeconds: seconds,
  endSeconds: seconds,
  development: z.string().trim().min(1),
  captions: strings,
  audio: z.object({ music: audioText, effects: audioText, lyrics: strings }),
  readingHoldSeconds: seconds,
});
export const StoryboardSceneSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  startSeconds: seconds,
  endSeconds: seconds,
  purpose: z.string(),
  visuals: strings,
  assets: strings,
  beats: z.array(StoryboardBeatSchema).min(1),
});
export const StoryboardSchema = z
  .object({
    version: z.literal(3),
    title: z.string().trim().min(1),
    durationSeconds: z.number().finite().positive(),
    scenes: z.array(StoryboardSceneSchema).min(1),
    pacingAudit: z.object({ findings: strings, justifiedHolds: strings }),
    notes: strings,
  })
  .superRefine((storyboard, context) => {
    const tolerance = 0.001;
    const issue = (path: (string | number)[], message: string) =>
      context.addIssue({ code: "custom", path, message });
    const ids = new Set<string>();
    let sceneEnd = 0;
    storyboard.scenes.forEach((scene, i) => {
      const prefix = ["scenes", i];
      if (ids.has(scene.id)) issue([...prefix, "id"], "Scene IDs must be unique");
      ids.add(scene.id);
      if (Math.abs(scene.startSeconds - sceneEnd) > tolerance)
        issue(
          [...prefix, "startSeconds"],
          "Scenes must be ordered and contiguous, starting at zero",
        );
      if (
        scene.endSeconds <= scene.startSeconds ||
        scene.endSeconds > storyboard.durationSeconds + tolerance
      )
        issue(
          [...prefix, "endSeconds"],
          "Scene must have positive length within the video duration",
        );
      let beatEnd = scene.startSeconds;
      scene.beats.forEach((beat, j) => {
        const beatPath = [...prefix, "beats", j];
        if (Math.abs(beat.startSeconds - beatEnd) > tolerance)
          issue(
            [...beatPath, "startSeconds"],
            "Beats must be ordered and contiguous within the scene",
          );
        if (beat.endSeconds <= beat.startSeconds || beat.endSeconds > scene.endSeconds + tolerance)
          issue([...beatPath, "endSeconds"], "Beat must have positive length within its scene");
        if (beat.readingHoldSeconds > beat.endSeconds - beat.startSeconds + tolerance)
          issue([...beatPath, "readingHoldSeconds"], "Reading hold cannot exceed beat duration");
        beatEnd = beat.endSeconds;
      });
      if (Math.abs(beatEnd - scene.endSeconds) > tolerance)
        issue([...prefix, "beats"], "Beats must cover the complete scene");
      sceneEnd = scene.endSeconds;
    });
    if (Math.abs(sceneEnd - storyboard.durationSeconds) > tolerance)
      issue(["scenes"], "Scenes must cover the complete video duration");
  });
export type Storyboard = z.infer<typeof StoryboardSchema>;

// Version 2 is only an explicitly migrated historical document, never a generation output.
export const MigratedStoryboardSchema = z.object({
  version: z.literal(2),
  durationSeconds: z.number().finite().positive(),
  format: z.literal("structured"),
  sections: z.array(
    z.object({
      heading: z.string().nullable(),
      level: z.number().int().nonnegative(),
      blocks: z.array(z.unknown()),
    }),
  ),
});
export const SavedStoryboardSchema = z.union([StoryboardSchema, MigratedStoryboardSchema]);
