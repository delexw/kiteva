import { expect, it } from "vitest";
import { activityDisplayRows } from "../src/client/room/activity-rows";
import type { DisplayActivityItem } from "../src/client/activity-display";

const item = (id: number, children?: DisplayActivityItem[]): DisplayActivityItem => ({
  id,
  kind: "notice",
  scope: "project",
  text: `Update ${id}`,
  time: "2026-01-01T00:00:00Z",
  children,
});

it("flattens all nested rows in display order with stable keys and indentation", () => {
  const items = [item(1, [item(2, [item(3)]), item(4)]), item(5)];
  const original = structuredClone(items);
  expect(
    activityDisplayRows(items).map(({ key, depth, item }) => ({ key, depth, id: item.id })),
  ).toEqual([
    { key: "activity/1", depth: 0, id: 1 },
    { key: "activity/1/2", depth: 1, id: 2 },
    { key: "activity/1/2/3", depth: 2, id: 3 },
    { key: "activity/1/4", depth: 1, id: 4 },
    { key: "activity/5", depth: 0, id: 5 },
  ]);
  expect(items).toEqual(original);
  expect(activityDisplayRows([...items, item(6)]).slice(0, 5)).toEqual(activityDisplayRows(items));
});

it("counts a large nested group as individual rows rather than one virtual item", () => {
  expect(
    activityDisplayRows([
      item(
        1,
        Array.from({ length: 10000 }, (_, index) => item(index + 2)),
      ),
    ]),
  ).toHaveLength(10001);
  expect(activityDisplayRows([])).toEqual([]);
});
