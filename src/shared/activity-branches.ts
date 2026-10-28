import type { DisplayActivityItem } from "./activity-display";
import { activityProgressPercent } from "./activity-display";

export type ActivityBranchItem = Omit<DisplayActivityItem, "children"> & { hasChildren: boolean };
export type ActivityBranch = {
  items: ActivityBranchItem[];
  nextOffset?: number;
  lastEventId: number;
  retryItemId?: number;
};
export const activityBranchPageSize = 100;

/** Return immediate children only, using the same grouped hierarchy as the UI. */
export function activityBranchPage(tree: DisplayActivityItem[], parents: number[], offset = 0) {
  let children = tree;
  for (const id of parents) children = children.find((item) => item.id === id)?.children || [];
  return {
    items: children.slice(offset, offset + activityBranchPageSize).map((item) => {
      const { children: nested, ...node } = item;
      return {
        ...node,
        progressPercent: activityProgressPercent(item),
        hasChildren: Boolean(nested?.length),
      };
    }),
    ...(offset + activityBranchPageSize < children.length
      ? { nextOffset: offset + activityBranchPageSize }
      : {}),
  };
}
