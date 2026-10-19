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
