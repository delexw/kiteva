import { expect, it } from "vitest";
import { createOpenScreenProject } from "../src/server/capture/native-project";

it("preserves native click effects and source-anchored edits without inventing framing", () => {
  const project = createOpenScreenProject(
    "/capture/source.mp4",
    12,
    { width: 1920, height: 1080 },
    {
      cursorModel3d: true,
      cursorClickImpact: true,
      cursorClickBounce: 2.5,
      trimRegions: [{ id: "idle", startMs: 0, endMs: 2000 }],
      zoomRegions: [
        {
          id: "focus",
          startMs: 3000,
          endMs: 5000,
          depth: 3,
          focus: { cx: 0.5, cy: 0.4 },
          focusMode: "manual",
          source: "manual",
        },
      ],
    },
  );
  expect(project.legacyEditor).toEqual({
    cursorModel3d: true,
    cursorClickImpact: true,
    cursorClickBounce: 2.5,
  });
  expect(project.timeline.clips[0]).toMatchObject({ sourceStartSec: 0, sourceEndSec: 12 });
  expect(project.timeline.trimRanges[0]).toMatchObject({
    clipId: project.timeline.clips[0].id,
    startSec: 0,
    endSec: 2,
  });
  expect(project.zoomRanges[0]).toMatchObject({
    clipId: project.timeline.clips[0].id,
    sourceStartSec: 3,
    sourceEndSec: 5,
  });
  expect(project.assets[0].originalPath).toBe("/capture/source.mp4");
});
