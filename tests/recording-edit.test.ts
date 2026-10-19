import { expect, it } from "vitest";
import {
  editedPointerEvents,
  recordingEdit,
  fallbackInteractionZooms,
} from "../src/server/capture/recording-edit";

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

it("uses native project zoom for short takes where OpenScreen automatic zoom is intentionally ineligible", () => {
  const events = [{ time: 0.4, x: 100, y: 80, kind: "click" as const }];
  const frame = { width: 400, height: 200, left: 0, top: 20 };
  expect(fallbackInteractionZooms(events, 3, frame)).toEqual([
    {
      id: "interaction-focus-0",
      startMs: 0,
      endMs: 1300,
      depth: 3,
      focus: { cx: 0.25, cy: 0.5 },
      focusMode: "auto",
      source: "manual",
    },
  ]);
  expect(fallbackInteractionZooms([{ ...events[0], time: 4 }], 10, frame)).toEqual([]);
  expect(fallbackInteractionZooms([], 3, frame)).toEqual([]);
});

it("adds native focus for closing clicks that auto-zoom would leave wide", () => {
  const regions = fallbackInteractionZooms(
    [
      { time: 4, x: 10, y: 20, kind: "click" },
      { time: 9.4, x: 80, y: 60, kind: "click" },
    ],
    10,
    { width: 100, height: 100, left: 0, top: 0 },
  );
  expect(regions).toHaveLength(1);
  expect(regions[0]).toMatchObject({ startMs: 8750, endMs: 10000, focusMode: "auto" });
});

it("keeps native zoom spans in source time when idle trimming shifts the delivered timeline", () => {
  const trims = [{ id: "head", startMs: 0, endMs: 2000 }];
  expect(
    fallbackInteractionZooms(
      [{ time: 2.4, x: 20, y: 20, kind: "click" }],
      5,
      { width: 100, height: 100, left: 0, top: 0 },
      trims,
    )[0],
  ).toMatchObject({ startMs: 2000, endMs: 3300 });
});

it("focuses before the first click and follows all controls in short takes", () => {
  const regions = fallbackInteractionZooms(
    [
      { time: 1.2, x: 10, y: 20, kind: "click" },
      { time: 3.2, x: 80, y: 60, kind: "click" },
    ],
    5,
    { width: 100, height: 100, left: 0, top: 0 },
  );
  expect(regions[0]).toMatchObject({ startMs: 550, endMs: 4100, focusMode: "auto", depth: 3 });
});
