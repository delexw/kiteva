import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { storyboardPageSchema } from "../src/client/storyboard-model";
import { storyboardMovieCues } from "../src/client/storyboard-movie";
import { storyboardCrewPlan, storyboardCrewState } from "../src/client/storyboard-crew-plan";
import { StoryboardCrew } from "../src/client/storyboard-crew";

function cues(development: string, extra = {}) {
  return storyboardMovieCues(
    storyboardPageSchema.parse({
      durationSeconds: 10,
      scenes: [
        {
          startSeconds: 0,
          endSeconds: 10,
          beats: [{ startSeconds: 0, endSeconds: 10, development, ...extra }],
        },
      ],
    }),
  );
}
it("assigns equipment and work from the saved visual, lettering, camera and sound cues", () => {
  const source = "Camera pans past a photo as the spotlight lights the title";
  const plan = storyboardCrewPlan(cues(source, { audio: { effects: ["Impact"] } }));
  for (const tasks of Object.values(plan)) {
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ start: 0, end: 10, source });
  }
});
it("does not invent tasks for a quiet reading hold", () => {
  expect(Object.values(storyboardCrewPlan(cues("Quiet reading hold"))).flat()).toEqual([]);
});
it("travels to a work position, works, returns and settles during the remaining hold", () => {
  const plan = storyboardCrewPlan(cues("A photo appears"));
  expect(storyboardCrewState(plan, "stage", 0).x).toBe(30);
  expect(storyboardCrewState(plan, "stage", 0).bounce).toBeCloseTo(0);
  const arriving = storyboardCrewState(plan, "stage", 0.5);
  expect(arriving.phase).toBe("arriving");
  expect(arriving.x).toBeGreaterThan(30);
  expect(arriving.x).toBeLessThan(42);
  expect(storyboardCrewState(plan, "stage", 1.6)).toMatchObject({
    phase: "working",
    x: 42,
    working: true,
  });
  expect(storyboardCrewState(plan, "stage", 3)).toMatchObject({ phase: "returning", facing: -1 });
  for (const position of [-1, 4, 9, 10])
    expect(storyboardCrewState(plan, "stage", position)).toMatchObject({
      x: 30,
      bounce: 0,
      tilt: 0,
      phase: "ready",
    });
  expect(storyboardCrewState(plan, "lighting", 1)).toMatchObject({ phase: "ready" });
});
it("is deterministic when paused, seeking backwards or replaying, including short cues", () => {
  const saved = cues("A photo appears");
  saved[0].end = 0.5;
  const plan = storyboardCrewPlan(saved);
  const first = storyboardCrewState(plan, "stage", 0.2);
  storyboardCrewState(plan, "stage", 0.4);
  expect(storyboardCrewState(plan, "stage", 0.2)).toEqual(first);
  expect(storyboardCrewState(plan, "stage", 0.5)).toMatchObject({ phase: "ready", x: 30 });
});
it("retains the original character silhouette and gives each specialist recognizable equipment", () => {
  for (const [role, equipment] of [
    ["lighting", "manga-light-prop"],
    ["art", "manga-pencil-prop"],
    ["sound", "manga-headphones-prop"],
  ] as const) {
    const html = renderToStaticMarkup(<StoryboardCrew role={role} />);
    expect(html).toContain("manga-head");
    expect(html).toContain("manga-body");
    expect(html).toContain(equipment);
  }
});
