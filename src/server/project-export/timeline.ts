import {
  Timeline,
  Track,
  Clip,
  ExternalReference,
  RationalTime,
  TimeRange,
  TrackKind,
} from "otio.js";
import type { Storyboard } from "../../shared/agents/schemas/storyboard";

export type ExportMedia = { path: string; name: string; duration: number };
export function editableTimeline(input: {
  title: string;
  fps: number;
  video?: ExportMedia;
  audio: ExportMedia[];
  storyboard?: Storyboard;
}) {
  const timeline = new Timeline(input.title);
  const range = (start: number, duration: number) =>
    new TimeRange(
      RationalTime.fromSeconds(start, input.fps),
      RationalTime.fromSeconds(duration, input.fps),
    );
  const video = new Track("Rendered scenes", [], TrackKind.VIDEO);
  if (input.video) {
    const media = input.video;
    const scenes = input.storyboard?.scenes ?? [
      { title: media.name, startSeconds: 0, endSeconds: media.duration },
    ];
    for (const scene of scenes) {
      const end = Math.min(scene.endSeconds, media.duration);
      if (end > scene.startSeconds)
        video.appendChild(
          new Clip(
            scene.title,
            new ExternalReference(media.path),
            range(scene.startSeconds, end - scene.startSeconds),
          ),
        );
    }
  }
  timeline.tracks.appendChild(video);
  for (const media of input.audio) {
    const track = new Track(media.name, [], TrackKind.AUDIO);
    track.appendChild(
      new Clip(media.name, new ExternalReference(media.path), range(0, media.duration)),
    );
    timeline.tracks.appendChild(track);
  }
  // otio.js omits the time-object schema tags required by the official OTIO reader.
  return JSON.stringify(
    timeline.toJSON(),
    (key, value) => {
      if (value && typeof value === "object") {
        if (key === "source_range") return { OTIO_SCHEMA: "TimeRange.1", ...value };
        if (typeof value.rate === "number" && typeof value.value === "number")
          return { OTIO_SCHEMA: "RationalTime.1", ...value };
      }
      return value;
    },
    2,
  );
}

export function storyboardSubtitles(storyboard?: Storyboard) {
  const cues: { start: number; end: number; text: string }[] = [];
  for (const scene of storyboard?.scenes ?? []) {
    for (const beat of scene.beats) {
      const text = beat.audio.lyrics.join("\n").trim();
      if (!text) continue;
      const previous = cues.at(-1);
      if (previous?.text === text && Math.abs(previous.end - beat.startSeconds) < 0.001)
        previous.end = beat.endSeconds;
      else cues.push({ start: beat.startSeconds, end: beat.endSeconds, text });
    }
  }
  const timestamp = (seconds: number) => {
    const milliseconds = Math.round(seconds * 1000);
    const date = new Date(milliseconds);
    return `${String(Math.floor(milliseconds / 3600000)).padStart(2, "0")}:${date.toISOString().slice(14, 19)},${String(milliseconds % 1000).padStart(3, "0")}`;
  };
  return cues
    .map((cue, i) => `${i + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}\n`)
    .join("\n");
}
