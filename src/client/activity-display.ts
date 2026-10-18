import { taskActivityLabels, type ActivityItem } from "./agent-activity-model";

export interface DisplayActivityItem extends ActivityItem {
  children?: DisplayActivityItem[];
}

const videoImplementationLabels = new Set([taskActivityLabels["full video generation"].working]);

/** Present known capabilities within a single model task without exposing its internal actions. */
export function displayActivityItems(items: ActivityItem[]): DisplayActivityItem[] {
  const display: DisplayActivityItem[] = [];
  let group: DisplayActivityItem | undefined;
  for (const item of items) {
    const visible = { ...item, repetitions: undefined };
    if (item.purpose !== "full video generation" || item.kind === "message" || !item.invocationId) {
      group = undefined;
      display.push(visible);
      continue;
    }
    if (!group || group.scope !== item.scope || group.invocationId !== item.invocationId) {
      group = {
        ...visible,
        kind: "notice",
        text: "Creating your video…",
        status: undefined,
        children: [],
      };
      display.push(group);
    }
    group.time = item.time;
    // Finished tool actions cannot establish that the whole video is finished.
    if (item.status === "running") group.status = "running";
    if (!videoImplementationLabels.has(item.text)) {
      const prior = group.children!.find(
        (child) => child.text === item.text && child.kind === item.kind,
      );
      if (!prior) group.children!.push(visible);
      else {
        const statuses: Array<ActivityItem["status"]> = [
          "running",
          "failed",
          "stopped",
          undefined,
          "complete",
        ];
        prior.status = statuses.find((status) => status === prior.status || status === item.status);
      }
    }
  }
  return display;
}
