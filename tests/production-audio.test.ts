import { expect, it } from "vitest";
import {
  AudioTracksSchema,
  validateAudioTracks,
  separateAudioGuidance,
} from "../src/shared/audio-tracks";
import {
  ProductionSchema,
  videoGenerationOutputSchemaForDuration,
} from "../src/shared/agents/schemas/video";
import { rendererMetadataFor } from "../src/server/rendering/renderer-metadata";
import { workspaceFolders } from "../src/shared/workspace";
const clips = [
  {
    id: "hit",
    kind: "sfx" as const,
    label: "Hit",
    file: `${workspaceFolders.audioStudio}/hit.wav`,
    startSeconds: 1,
    durationSeconds: 0.25,
    volume: 0.5,
  },
];
it("validates finite timings, unique IDs, gain and film bounds while retaining legacy manifests", () => {
  expect(validateAudioTracks(clips, 3)).toEqual(clips);
  expect(() => validateAudioTracks(clips, 1)).toThrow("exceeds");
  expect(AudioTracksSchema.safeParse([...clips, ...clips]).success).toBe(false);
  expect(AudioTracksSchema.safeParse([{ ...clips[0], startSeconds: NaN }]).success).toBe(false);
  expect(AudioTracksSchema.safeParse([{ ...clips[0], volume: -1 }]).success).toBe(false);
  expect(ProductionSchema.shape.audioTracks.safeParse(undefined).success).toBe(true);
  expect(
    videoGenerationOutputSchemaForDuration(3, true).shape.audioTracks.safeParse(undefined).success,
  ).toBe(false);
  for (const renderer of ["multiplane", "hyperframes", "remotion"] as const)
    expect(rendererMetadataFor(renderer).audio.guidance).toContain(separateAudioGuidance);
});

it("keeps model-owned mixing and renderer handoff alongside preserved source files", () => {
  expect(separateAudioGuidance).toContain(
    "You remain responsible for using tools/code to mix music and SFX",
  );
  expect(separateAudioGuidance).toContain(
    "Keep the separate source files unchanged alongside that final mix",
  );
  expect(separateAudioGuidance).not.toContain("The application mixes these clips");
});
