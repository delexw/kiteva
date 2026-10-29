import { expect, it } from "vitest";
import { productionDeskModel } from "../src/client/lib/production-desk";
import { storyboardPageSchema } from "../src/client/storyboard-model";
import type { VideoGenerationJob } from "../src/shared/domains/video";
import { validStoryboard } from "./fixtures/storyboard";
const job: VideoGenerationJob = {
  id: "job",
  runId: "project",
  candidateId: "direction",
  kind: "full",
  phase: "ready",
  workspace: "/tmp/fixture",
  model: "fixture",
  duration: 30,
  video: "renders/full.mp4",
};
it("shows only timed source clips when an authoritative audio manifest exists", () => {
  const production = {
    pipeline: "Multiplane" as const,
    fallbackReason: null,
    sourceFile: "artifacts/shots/one.html",
    duration: 30,
    width: 320,
    height: 180,
    styleRenderer: ["HTML"],
    motionEngine: ["Time"],
    audioDescription: "Separate sources",
    limitations: [],
    audioFile: "old-merged.wav",
    audioTracks: [
      {
        id: "music",
        kind: "music" as const,
        label: "Music only",
        file: "music.wav",
        startSeconds: 0,
        durationSeconds: 30,
        volume: 0.5,
      },
      {
        id: "hit",
        kind: "sfx" as const,
        label: "Hit",
        file: "hit.wav",
        startSeconds: 7,
        durationSeconds: 0.25,
        volume: 1,
      },
    ],
  };
  const board = storyboardPageSchema.parse(validStoryboard(30));
  board.scenes[0].beats[0].audio.effects = ["Planned effect"];
  const model = productionDeskModel({ ...job, production }, board);
  expect(model.tracks[2].clips).toEqual([
    expect.objectContaining({ source: "hit.wav", start: 7, end: 7.25, status: "media" }),
  ]);
  expect(model.tracks[3].clips).toEqual([
    expect.objectContaining({ source: "music.wav", status: "media" }),
  ]);
  const silent = productionDeskModel(
    { ...job, production: { ...production, audioTracks: [] } },
    board,
  );
  expect(silent.tracks.slice(2).every((track) => track.clips.length === 0)).toBe(true);
});
it("uses saved scenes and measured narration, while distinguishing planned effects from real stems", () => {
  const board = storyboardPageSchema.parse(validStoryboard(30));
  board.scenes[0].beats[0].audio.effects = ["Paper sound"];
  const input = {
    ...job,
    speechTrack: {
      file: "audio/narration.wav",
      durationSeconds: 4,
      source: "narration" as const,
      cues: [{ text: "Saved words", startSeconds: 2, endSeconds: 4 }],
    },
  };
  const original = structuredClone(input);
  const model = productionDeskModel(input, board);
  expect(model.tracks[0].clips[0]).toMatchObject({
    source: "renders/full.mp4",
    status: "flattened",
    start: 0,
    end: 30,
  });
  expect(model.tracks[1].clips[0]).toMatchObject({
    start: 2,
    end: 4,
    status: "media",
    timing: "Measured speech cues",
  });
  expect(model.tracks[2].clips[0]).toMatchObject({
    label: "Paper sound",
    status: "planned",
    timing: "Storyboard beat window",
  });
  expect(model.tracks[2].clips[0].source).toBeUndefined();
  expect(model.tracks[3].clips).toEqual([]);
  expect(input).toEqual(original);
});
it("keeps an incomplete job inspectable without pretending its sources are playable media", () => {
  const model = productionDeskModel(
    { ...job, video: undefined, phase: "failed" },
    storyboardPageSchema.parse(validStoryboard(30)),
  );
  expect(model.tracks[0].clips[0].status).toBe("planned");
  expect(model.tracks[0].clips[0].source).toBeUndefined();
  expect(model.tracks.slice(1).every((track) => !track.clips.length)).toBe(true);
});
it("uses production shot order and full soundtrack metadata when no storyboard is available", () => {
  const model = productionDeskModel({
    ...job,
    production: {
      pipeline: "Multiplane",
      fallbackReason: null,
      sourceFile: "artifacts/shots/one.html",
      duration: 30,
      width: 320,
      height: 180,
      styleRenderer: ["HTML"],
      motionEngine: ["Time"],
      audioDescription: "Saved mix",
      limitations: [],
      audioFile: "artifacts/assets/audio/score.wav",
      shots: [
        { sourceFile: "one.html", duration: 10 },
        { sourceFile: "two.html", duration: 20 },
      ],
    },
  });
  expect(model.tracks[0].clips.map((clip) => [clip.start, clip.end])).toEqual([
    [0, 10],
    [10, 30],
  ]);
  expect(model.tracks[3].clips[0]).toMatchObject({
    source: "artifacts/assets/audio/score.wav",
    status: "flattened",
    end: 30,
  });
});
it("clips measured cues to the film window and rejects invalid timing without filling gaps", () => {
  const model = productionDeskModel({
    ...job,
    speechTrack: {
      file: "audio/narration.wav",
      durationSeconds: 40,
      source: "narration",
      cues: [
        { text: "first", startSeconds: -1, endSeconds: 4 },
        { text: "last", startSeconds: 28, endSeconds: 40 },
        { text: "invalid", startSeconds: 8, endSeconds: 7 },
        { text: "unknown", startSeconds: NaN, endSeconds: 9 },
      ],
    },
  });
  expect(model.tracks[1].clips.map((clip) => [clip.start, clip.end])).toEqual([
    [0, 4],
    [28, 30],
  ]);
  expect(model.omitted).toBe(2);
});
