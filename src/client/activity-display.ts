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
    if (item.kind === "message" || !item.invocationId) {
      group = undefined;
      display.push(visible);
      continue;
    }
    let target = display;
    if (item.purpose !== "full video generation") {
      group = undefined;
      if (item.kind !== "tool") {
        display.push(visible);
        continue;
      }
    } else {
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
      target = group.children!;
    }
    const prior = target.find(
      (child) =>
        child.text === item.text &&
        child.kind === item.kind &&
        child.scope === item.scope &&
        child.invocationId === item.invocationId &&
        child.purpose === item.purpose,
    );
    if (!prior) target.push(visible);
    else {
      // Pending actions still matter; otherwise the latest attempt is the outcome.
      prior.status =
        prior.status === "running" || item.status === "running" ? "running" : item.status;
      prior.time = item.time;
    }
  }
  const chronological = (left: ActivityItem, right: ActivityItem) =>
    left.time.localeCompare(right.time) || left.id - right.id;
  for (const item of display) {
    item.children?.sort(chronological);
  }
  return display.sort(chronological);
}
