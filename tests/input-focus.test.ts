import { expect, it } from "vitest";
import { inputFocusZooms } from "../src/server/capture/input-focus";

it.each([
  { x: 20, y: 180, width: 1100, height: 240 },
  { x: 80, y: 40, width: 400, height: 780 },
  { x: 500, y: 300, width: 300, height: 80 },
])("keeps the complete field and label within the native zoom: %j", (bounds) => {
  const frame = { width: 1440, height: 1000, left: 0, top: 40 };
  const [region] = inputFocusZooms([{ start: 2, end: 5, bounds }], frame);
  const scale = region.customScale!;
  const center = { x: region.focus.cx * frame.width, y: region.focus.cy * frame.height };
  expect(center.x - frame.width / scale / 2).toBeLessThanOrEqual(bounds.x - 24);
  expect(center.x + frame.width / scale / 2).toBeGreaterThanOrEqual(bounds.x + bounds.width + 24);
  expect(center.y - frame.height / scale / 2).toBeLessThanOrEqual(bounds.y + frame.top - 24);
  expect(center.y + frame.height / scale / 2).toBeGreaterThanOrEqual(
    bounds.y + frame.top + bounds.height + 24,
  );
  expect(region).toMatchObject({ startMs: 2000, endMs: 5000, focusMode: "manual" });
});

it("keeps full-width inputs wide instead of forcing a crop", () => {
  expect(
    inputFocusZooms([{ start: 1, end: 2, bounds: { x: 0, y: 10, width: 1440, height: 60 } }], {
      width: 1440,
      height: 1000,
      left: 0,
      top: 0,
    })[0].customScale,
  ).toBe(1);
});
