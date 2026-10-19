import { expect, it } from "vitest";
import { editedPointerEvents, recordingEdit } from "../src/server/capture/recording-edit";

it("removes model thinking gaps while preserving the complete typing action and explicit hold", () => {
  const trims = recordingEdit(40, [
    { start: 12, end: 14 },
    { start: 30, end: 35 },
  ]);
  expect(trims).toEqual([
    { id: "idle-0", startMs: 0, endMs: 11650 },
    { id: "idle-1", startMs: 14900, endMs: 29650 },
    { id: "idle-2", startMs: 35900, endMs: 40000 },
  ]);
  expect(
    editedPointerEvents(
      [
        { time: 13, x: 50, y: 60, kind: "click" },
        { time: 20, x: 50, y: 60, kind: "move" },
        { time: 32, x: 60, y: 70, kind: "click" },
      ],
      trims,
    ),
  ).toEqual([
    { time: expect.closeTo(1.35), x: 50, y: 60, kind: "click" },
    { time: expect.closeTo(5.6), x: 60, y: 70, kind: "click" },
  ]);
});
it("keeps adjacent actions continuous and does not invent edits for a passive recording", () => {
  expect(
    recordingEdit(4, [
      { start: 0, end: 1 },
      { start: 1.5, end: 4 },
    ]),
  ).toEqual([]);
  expect(recordingEdit(4, [])).toEqual([]);
});
