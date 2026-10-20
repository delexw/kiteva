import { type ActivityItem } from "./agent-activity-model";

export interface DisplayActivityItem extends ActivityItem {
  children?: DisplayActivityItem[];
}

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
    const prior = group.children!.find(
      (child) => child.text === item.text && child.kind === item.kind,
    );
    if (!prior) group.children!.push(visible);
    else {
      // Pending actions still matter; otherwise the latest attempt is the outcome.
      prior.status =
        prior.status === "running" || item.status === "running" ? "running" : item.status;
      prior.time = item.time;
    }
  }
  for (const item of display) {
    item.children?.sort((left, right) => left.time.localeCompare(right.time) || left.id - right.id);
  }
  return display;
}
