import { z } from "zod";
import { workspaceFolders } from "./workspace";

export const AudioClipSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(["music", "sfx"]),
  label: z.string().trim().min(1),
  file: z.string().trim().min(1),
  startSeconds: z.number().finite().nonnegative(),
  durationSeconds: z.number().finite().positive(),
  volume: z.number().finite().min(0).max(4),
});
export const AudioTracksSchema = z
  .array(AudioClipSchema)
  .max(256)
  .superRefine((clips, ctx) => {
    const ids = new Set<string>();
    for (const [index, clip] of clips.entries()) {
      if (ids.has(clip.id))
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Audio clip IDs must be unique",
        });
      ids.add(clip.id);
    }
  });
export type AudioClip = z.infer<typeof AudioClipSchema>;

export function validateAudioTracks(clips: AudioClip[], duration: number) {
  const parsed = AudioTracksSchema.parse(clips);
  for (const clip of parsed)
    if (clip.startSeconds + clip.durationSeconds > duration + 0.001)
      throw Error(`Audio clip exceeds the film window: ${clip.id}`);
  return parsed;
}

export const separateAudioGuidance = `SEPARATE AUDIO SOURCES: For new full-video builds, save music-only audio and each sound effect as separate local files under ${workspaceFolders.audioStudio}; never bake SFX or narration into the music stem. Return production.audioTracks and save the same array in production.json: [{id, kind: "music" | "sfx", label, file, startSeconds, durationSeconds, volume}]. Paths are workspace-relative; startSeconds is absolute film time, durationSeconds is the actual trimmed clip length, and volume is a linear gain (1 means unchanged). Prepare each source file from its own start with the intended trims, loops and fades already applied. Repeated effects may reference the same file with distinct IDs and start times. Keep clips within the film window. Use [] for intentional silence. You remain responsible for using tools/code to mix music and SFX with those timings and gains, then hand the finished soundtrack to the selected renderer using its existing audio contract. Keep the separate source files unchanged alongside that final mix; audioTracks describes those sources for Desk, not an application mixing request. For Multiplane, audioFile must reference your finished music/SFX mix, not the music-only stem. For HyperFrames or Remotion, integrate the finished mix through their supported composition audio contract. Keep application-prepared narration separate; Kiteva still mixes that voice afterward. Preserve this manifest and source files during refinements/corrections; update affected placements when timing changes. Legacy productions without audioTracks retain their existing soundtrack behavior. Do not invent generated files or add unrequested audio.`;
