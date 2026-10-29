import type { VideoGenerationJob } from "../../shared/domains/video";
import type { MangaStoryboard } from "../storyboard-model";

export type DeskClip = {
  id: string;
  label: string;
  start: number;
  end: number;
  source?: string;
  status: "media" | "flattened" | "planned";
  timing:
    | "Production timing"
    | "Storyboard scene"
    | "Measured speech cues"
    | "Storyboard beat window";
};
export type DeskTrack = {
  id: "video" | "narration" | "sfx" | "music";
  label: string;
  clips: DeskClip[];
  note: string;
};

/** Project inspection only: no source parsing, media generation, waveform synthesis or guessed stems. */
export function productionDeskModel(job: VideoGenerationJob, storyboard?: MangaStoryboard) {
  const positive = (value?: number) => (Number.isFinite(value) && value! > 0 ? value : undefined);
  const duration =
    positive(job.production?.duration) ??
    positive(storyboard?.durationSeconds) ??
    positive(job.duration) ??
    1;
  const title = storyboard?.title || job.production?.displayTitle || "Production Desk";
  const tracks: DeskTrack[] = [
    {
      id: "video",
      label: "Video",
      clips: [],
      note: "Graphic layers are flattened into the rendered video.",
    },
    { id: "narration", label: "Narration", clips: [], note: "Saved narration cues" },
    {
      id: "sfx",
      label: "Sound effects",
      clips: [],
      note: "Sound effects show storyboard beat windows, not measured SFX timing.",
    },
    {
      id: "music",
      label: "Music / soundtrack",
      clips: [],
      note: "Saved soundtrack may include music and effects. Separate stems are not confirmed.",
    },
  ];
  let omitted = 0;
  const add = (track: DeskTrack, clip: DeskClip) => {
    if (
      !Number.isFinite(clip.start) ||
      !Number.isFinite(clip.end) ||
      clip.end <= clip.start ||
      clip.end <= 0 ||
      clip.start >= duration
    ) {
      omitted++;
      return;
    }
    track.clips.push({
      ...clip,
      start: Math.max(0, clip.start),
      end: Math.min(duration, clip.end),
    });
  };
  const videoStatus = job.video ? "flattened" : "planned";
  const scenes =
    storyboard?.scenes.filter(
      (scene) => scene.startSeconds !== undefined && scene.endSeconds !== undefined,
    ) ?? [];
  if (scenes.length) {
    scenes.forEach((scene, index) =>
      add(tracks[0], {
        id: `video-${index}`,
        label: scene.title || `Scene ${index + 1}`,
        start: scene.startSeconds!,
        end: scene.endSeconds!,
        source: job.video || job.production?.sourceFile,
        status: videoStatus,
        timing: "Storyboard scene",
      }),
    );
  } else if (job.production?.shots?.length) {
    let start = 0;
    job.production.shots.forEach((shot, index) => {
      add(tracks[0], {
        id: `video-${index}`,
        label: shot.sourceFile.split("/").at(-1) || "Video",
        start,
        end: start + shot.duration,
        source: job.video || shot.sourceFile,
        status: videoStatus,
        timing: "Production timing",
      });
      start += shot.duration;
    });
  } else if (job.video || job.production?.sourceFile) {
    add(tracks[0], {
      id: "video",
      label: "Video",
      start: 0,
      end: duration,
      source: job.video || job.production?.sourceFile,
      status: videoStatus,
      timing: "Production timing",
    });
  }
  job.speechTrack?.cues.forEach((cue, index) =>
    add(tracks[1], {
      id: `narration-${index}`,
      label: cue.text,
      start: cue.startSeconds,
      end: cue.endSeconds,
      source: job.speechTrack!.file,
      status: "media",
      timing: "Measured speech cues",
    }),
  );
  if (job.speechTrack && !job.speechTrack.cues.length) {
    add(tracks[1], {
      id: "narration",
      label: "Narration",
      start: 0,
      end: job.speechTrack.durationSeconds,
      source: job.speechTrack.file,
      status: "media",
      timing: "Production timing",
    });
  }
  const sourceTracks = job.production?.audioTracks;
  if (sourceTracks !== undefined) {
    tracks[2].note = "Saved sound effect sources and placements";
    tracks[3].note = "Separate music sources; effects and narration are not included.";
    for (const clip of sourceTracks)
      add(tracks[clip.kind === "sfx" ? 2 : 3], {
        id: `audio-${clip.id}`,
        label: clip.label,
        start: clip.startSeconds,
        end: clip.startSeconds + clip.durationSeconds,
        source: clip.file,
        status: "media",
        timing: "Production timing",
      });
  }
  for (const [sceneIndex, scene] of (sourceTracks === undefined
    ? (storyboard?.scenes ?? [])
    : []
  ).entries())
    for (const [beatIndex, beat] of scene.beats.entries()) {
      const label = beat.audio.effects.filter((effect) => effect.trim()).join(" · ");
      if (label)
        add(tracks[2], {
          id: `effect-${sceneIndex}-${beatIndex}`,
          label,
          start: beat.startSeconds ?? NaN,
          end: beat.endSeconds ?? NaN,
          status: "planned",
          timing: "Storyboard beat window",
        });
    }
  if (sourceTracks === undefined && job.production?.audioFile)
    add(tracks[3], {
      id: "soundtrack",
      label: "Saved soundtrack",
      start: 0,
      end: duration,
      source: job.production.audioFile,
      status: "flattened",
      timing: "Production timing",
    });
  return { title, duration, tracks, omitted };
}
