import { expect, it } from "vitest";
import { storyboardPageSchema } from "../src/client/storyboard-model";
import {
  storyboardMovieCues,
  storyboardCueMotion,
  storyboardCueAt,
  storyboardBubble,
  storyboardSceneTransition,
} from "../src/client/storyboard-movie";
it("plans the movie from saved cue times, sorted by film time and bounded by film duration", () => {
  const storyboard = storyboardPageSchema.parse({
    durationSeconds: 8,
    scenes: [
      {
        title: "Later",
        startSeconds: 4,
        endSeconds: 10,
        beats: [{ startSeconds: 4, endSeconds: 10, development: "The card slides in" }],
      },
      {
        title: "First",
        startSeconds: 0,
        endSeconds: 4,
        beats: [
          { startSeconds: 0, endSeconds: 2, development: "The page opens" },
          { startSeconds: 2, endSeconds: 4, development: "Hold" },
        ],
      },
    ],
  });
  const cues = storyboardMovieCues(storyboard);
  expect(cues.map((cue) => [cue.start, cue.end])).toEqual([
    [0, 2],
    [2, 4],
    [4, 8],
  ]);
  expect(cues[0].scene.title).toBe("First");
  expect(cues[2].beat.development).toBe("The card slides in");
});
it("does not invent timing for untimed cues and excludes invalid intervals", () => {
  const storyboard = storyboardPageSchema.parse({
    durationSeconds: 10,
    scenes: [
      {
        beats: [
          { development: "No timings" },
          { startSeconds: 4, endSeconds: 4 },
          { startSeconds: 11, endSeconds: 12 },
        ],
      },
    ],
  });
  expect(storyboardMovieCues(storyboard)).toEqual([]);
});
it("uses next recorded cue or scene bounds when beat end is absent", () => {
  const storyboard = storyboardPageSchema.parse({
    durationSeconds: 10,
    scenes: [
      { startSeconds: 0, endSeconds: 10, beats: [{ startSeconds: 0 }, { startSeconds: 4 }] },
    ],
  });
  expect(storyboardMovieCues(storyboard).map((cue) => [cue.start, cue.end])).toEqual([
    [0, 4],
    [4, 10],
  ]);
});
it("chooses only supported motions named in each action cue", () => {
  expect(
    storyboardCueMotion("Camera moves left; words drop and a mask reveals the photo"),
  ).toMatchObject({ slide: true, fall: true, reveal: true, camera: true, zoom: false });
  expect(storyboardCueMotion("Reading hold")).toEqual({
    slide: false,
    fall: false,
    reveal: false,
    camera: false,
    zoom: false,
    impact: false,
  });
});

it("supports forward and backward seeks and holds the final cue on completion", () => {
  const storyboard = storyboardPageSchema.parse({
    durationSeconds: 8,
    scenes: [
      {
        startSeconds: 0,
        endSeconds: 8,
        beats: [
          { startSeconds: 0, endSeconds: 2 },
          { startSeconds: 4, endSeconds: 8 },
        ],
      },
    ],
  });
  const cues = storyboardMovieCues(storyboard);
  expect(storyboardCueAt(cues, 6, 8)?.beatIndex).toBe(1);
  expect(storyboardCueAt(cues, 1, 8)?.beatIndex).toBe(0);
  expect(storyboardCueAt(cues, 3, 8)).toBeUndefined();
  expect(storyboardCueAt(cues, 8, 8)?.beatIndex).toBe(1);
});

it("uses compact cue-aware bubble shapes without changing the saved instructions", () => {
  expect(storyboardBubble("The panel slams in; the caption follows.").kind).toBe("burst");
  expect(storyboardBubble("Reading hold while the camera drifts.").kind).toBe("thought");
  expect(storyboardBubble("A mask reveals the image.").kind).toBe("caption");
  expect(storyboardBubble("Pan right to the post grid (detail crop).")).toEqual({
    kind: "speech",
    text: "Pan right to the post grid",
  });
  const long =
    "The camera moves slowly across the scene showing a very long sequence of deliberately detailed instructions that should remain in the saved storyboard.";
  expect(storyboardBubble(long).text.length).toBeLessThanOrEqual(101);
});

it("scrolls between scenes on the existing film clock and supports backward seeks", () => {
  const storyboard = storyboardPageSchema.parse({
    durationSeconds: 12,
    scenes: [
      {
        title: "First",
        beats: [
          { startSeconds: 0, endSeconds: 4 },
          { startSeconds: 4, endSeconds: 8 },
        ],
      },
      { title: "Next", beats: [{ startSeconds: 8, endSeconds: 12 }] },
    ],
  });
  const cues = storyboardMovieCues(storyboard);
  expect(storyboardSceneTransition(cues, 4.3, 12)).toBeUndefined();
  expect(storyboardSceneTransition(cues, 8, 12)).toMatchObject({
    progress: 0,
    previous: { sceneIndex: 0, beatIndex: 1 },
  });
  expect(storyboardSceneTransition(cues, 8.45, 12)?.progress).toBeCloseTo(0.5);
  expect(storyboardSceneTransition(cues, 9.5, 12)).toBeUndefined();
  expect(storyboardSceneTransition(cues, 8.45, 12)?.previous.scene.title).toBe("First");
  expect(storyboardCueAt(cues, 9, 12)?.scene.title).toBe("Next");
});

it("introduces only the opening without changing the timeline and supports seeking", async () => {
  const { storyboardSceneTitle, storyboardMovieCues } =
    await import("../src/client/storyboard-movie");
  const { storyboardPageSchema } = await import("../src/client/storyboard-model");
  const cues = storyboardMovieCues(
    storyboardPageSchema.parse({
      durationSeconds: 12,
      scenes: [
        {
          title: "First setup",
          startSeconds: 0,
          endSeconds: 8,
          beats: [{ startSeconds: 0, endSeconds: 8, development: "Hold" }],
        },
        {
          title: "Second setup",
          startSeconds: 8,
          endSeconds: 12,
          beats: [{ startSeconds: 8, endSeconds: 12, development: "Reveal" }],
        },
      ],
    }),
  );
  expect(storyboardSceneTitle(cues, 0, 12)).toMatchObject({ title: "First setup", opacity: 1 });
  expect(storyboardSceneTitle(cues, 2.7, 12)?.opacity).toBeLessThan(1);
  expect(storyboardSceneTitle(cues, 3, 12)).toBeUndefined();
  expect(storyboardSceneTitle(cues, 8, 12)).toBeUndefined();
  expect(storyboardSceneTitle(cues, 9.5, 12)).toBeUndefined();
  expect(storyboardSceneTitle(cues, 0, 12)?.sceneIndex).toBe(0);
});

it("builds title glyphs in order and settles cleanly using the seekable movie clock", async () => {
  const { storyboardTitleGlyph } = await import("../src/client/storyboard-movie");
  expect(storyboardTitleGlyph(0, 12, 0, 1.6).opacity).toBe(0);
  expect(storyboardTitleGlyph(0, 12, 0.2, 1.6).opacity).toBe(1);
  expect(storyboardTitleGlyph(11, 12, 0.15, 1.6).opacity).toBe(0);
  expect(storyboardTitleGlyph(11, 12, 1, 1.6)).toEqual({
    opacity: 1,
    scale: 1,
    x: 0,
    blur: 0,
    echo: 0,
  });
  expect(storyboardTitleGlyph(0, 1, 0.4, 0.5)).toEqual({
    opacity: 1,
    scale: 1,
    x: 0,
    blur: 0,
    echo: 0,
  });
  expect(storyboardTitleGlyph(3, 12, 0.2, 1.6)).toEqual(storyboardTitleGlyph(3, 12, 0.2, 1.6));
});

it("pulses glyphs in a slow travelling wave without drifting when paused or seeking", async () => {
  const { storyboardTitleWave } = await import("../src/client/storyboard-movie");
  const first = storyboardTitleWave(0, 0.3, 3);
  expect(first.y).toBeLessThan(0);
  expect(storyboardTitleWave(4, 0.3, 3).y).not.toBe(first.y);
  expect(storyboardTitleWave(0, 0.3 + 60 / 90, 3).y).toBeCloseTo(first.y);
  expect(storyboardTitleWave(0, 0.3, 3)).toEqual(first);
  expect(storyboardTitleWave(4, 3, 3).scale).toBe(1);
  expect(Math.abs(storyboardTitleWave(4, 3, 3).y)).toBe(0);
});

it("briefly emphasizes only the crew member involved in the recorded action", async () => {
  const { storyboardCrewReactions, storyboardMovieCues } =
    await import("../src/client/storyboard-movie");
  const { storyboardPageSchema } = await import("../src/client/storyboard-model");
  const makeCue = (development: string) =>
    storyboardMovieCues(
      storyboardPageSchema.parse({
        durationSeconds: 5,
        scenes: [{ title: "Set", beats: [{ startSeconds: 0, endSeconds: 5, development }] }],
      }),
    )[0];
  expect(storyboardCrewReactions(makeCue("The spotlight snaps on"), 0.1)).toEqual({
    director: true,
    stage: false,
    camera: false,
  });
  expect(storyboardCrewReactions(makeCue("The camera moves toward the board"), 0.1)).toEqual({
    director: false,
    stage: false,
    camera: true,
  });
  expect(storyboardCrewReactions(makeCue("The panel opens"), 0.1).stage).toBe(true);
  expect(Object.values(storyboardCrewReactions(makeCue("Quiet reading hold"), 0.1))).not.toContain(
    true,
  );
  expect(
    Object.values(storyboardCrewReactions(makeCue("The spotlight snaps on"), 1)),
  ).not.toContain(true);
  expect(Object.values(storyboardCrewReactions(undefined, 0))).not.toContain(true);
});

it("shows changed director dialogue with a body gesture, then hides it without replaying duplicates", async () => {
  const { storyboardDirectorDialogue, storyboardMovieCues } =
    await import("../src/client/storyboard-movie");
  const { storyboardPageSchema } = await import("../src/client/storyboard-model");
  const cues = storyboardMovieCues(
    storyboardPageSchema.parse({
      durationSeconds: 12,
      scenes: [
        {
          title: "Set",
          beats: [
            { startSeconds: 0, endSeconds: 4, development: "Open the panel." },
            { startSeconds: 4, endSeconds: 8, development: "Open the panel." },
            { startSeconds: 8, endSeconds: 12, development: "Bring in the next prop." },
          ],
        },
      ],
    }),
  );
  expect(storyboardDirectorDialogue(cues, 0.1, 12)).toMatchObject({
    visible: true,
    reaction: true,
  });
  expect(storyboardDirectorDialogue(cues, 0.1, 12).bodyTilt).not.toBe(0);
  expect(storyboardDirectorDialogue(cues, 3, 12)).toEqual({
    visible: false,
    bodyTilt: 0,
    reaction: false,
  });
  expect(storyboardDirectorDialogue(cues, 4.1, 12).visible).toBe(false);
  expect(storyboardDirectorDialogue(cues, 8.1, 12).visible).toBe(true);
  expect(storyboardDirectorDialogue(cues, 0.1, 12).visible).toBe(true);
  expect(storyboardDirectorDialogue([], 0, 12).visible).toBe(false);
});
