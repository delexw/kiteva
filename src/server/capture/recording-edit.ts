export interface CaptureActivity {
  start: number;
  end: number;
}
export interface CapturePointer {
  time: number;
  x: number;
  y: number;
  kind: "move" | "click";
  cursorType?: "arrow" | "pointer" | "text";
}

/** Remove tool-call thinking gaps; preserve actual interaction time and explicit viewing waits. */
export function recordingEdit(duration: number, activities: readonly CaptureActivity[]) {
  const kept: CaptureActivity[] = [];
  for (const activity of activities) {
    const start = Math.max(0, activity.start - 0.35);
    const end = Math.min(duration, activity.end + 0.9);
    if (end <= start) continue;
    const previous = kept.at(-1);
    if (previous && start <= previous.end + 0.8) previous.end = Math.max(previous.end, end);
    else kept.push({ start, end });
  }
  if (!kept.length) return [];
  const trims: Array<{ id: string; startMs: number; endMs: number }> = [];
  let previous = 0;
  for (const range of [...kept, { start: duration, end: duration }]) {
    if (range.start - previous > 0.05)
      trims.push({
        id: `idle-${trims.length}`,
        startMs: Math.round(previous * 1000),
        endMs: Math.round(range.start * 1000),
      });
    previous = range.end;
  }
  return trims;
}

export function editedPointerEvents(
  events: readonly CapturePointer[],
  trims: ReturnType<typeof recordingEdit>,
) {
  return events
    .filter(
      (event) =>
        !trims.some((trim) => event.time * 1000 >= trim.startMs && event.time * 1000 < trim.endMs),
    )
    .map((event) => ({
      ...event,
      time:
        event.time -
        trims.reduce(
          (removed, trim) =>
            removed + Math.max(0, Math.min(event.time * 1000, trim.endMs) - trim.startMs),
          0,
        ) /
          1000,
    }));
}

/** Cover the short takes and wide opening/closing that OpenScreen's auto planner excludes. */
export function fallbackInteractionZooms(
  events: readonly CapturePointer[],
  sourceDuration: number,
  frame: { width: number; height: number; left: number; top: number },
  trims: ReturnType<typeof recordingEdit> = [],
) {
  const clicks = events.filter(
    (event) =>
      event.kind === "click" &&
      !trims.some((trim) => event.time * 1000 >= trim.startMs && event.time * 1000 < trim.endMs),
  );
  const duration =
    sourceDuration - trims.reduce((total, trim) => total + (trim.endMs - trim.startMs) / 1000, 0);
  if (!clicks.length || duration < 1) return [];
  const editedClicks = editedPointerEvents(clicks, trims);
  const groups =
    duration < 8
      ? [clicks]
      : [
          clicks.filter((_event, index) => editedClicks[index].time < 2.5),
          clicks.filter((_event, index) => editedClicks[index].time >= duration - 1),
        ];
  // Native clip anchors use SOURCE time, even when idle trimming shifts delivery time.
  const opening = trims.find((trim) => trim.startMs === 0)?.endMs ?? 0;
  const closing =
    trims.find((trim) => trim.endMs >= sourceDuration * 1000 - 1)?.startMs ?? sourceDuration * 1000;
  return groups.flatMap((group, index) => {
    const click = group[0];
    if (!click) return [];
    const startMs = Math.max(opening, Math.round(click.time * 1000 - 650));
    const endMs = Math.min(
      Math.round(closing),
      Math.max(startMs + 700, Math.round(group.at(-1)!.time * 1000 + 900)),
    );
    if (endMs <= startMs) return [];
    return [
      {
        id: `interaction-focus-${index}`,
        startMs,
        endMs,
        depth: 3,
        focus: {
          cx: (click.x + frame.left) / frame.width,
          cy: (click.y + frame.top) / frame.height,
        },
        focusMode: "auto",
        source: "manual",
      },
    ];
  });
}
