import type { DisplayActivityItem } from "../activity-display";

export type ActivityDisplayRow = {
  key: string;
  depth: number;
  item: DisplayActivityItem;
};

/** Flatten displayed groups so a large child group cannot bypass virtualization. */
export function activityDisplayRows(items: DisplayActivityItem[]): ActivityDisplayRow[] {
  const rows: ActivityDisplayRow[] = [];
  function visit(entries: DisplayActivityItem[], depth: number, parent: string) {
    for (const item of entries) {
      const key = `${parent}/${item.id}`;
      rows.push({ key, depth, item });
      if (item.children?.length) visit(item.children, depth + 1, key);
    }
  }
  visit(items, 0, "activity");
  return rows;
}
