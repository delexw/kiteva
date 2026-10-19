import type { OpenScreenZoomRegion } from "./native-project";

export interface InputFocus {
  start: number;
  end: number;
  bounds: { x: number; y: number; width: number; height: number };
}

/** Use native scale/focus controls to contain the field and label, not just the click point. */
export function inputFocusZooms(
  inputs: readonly InputFocus[],
  frame: { width: number; height: number; left: number; top: number },
): OpenScreenZoomRegion[] {
  return inputs.map(({ start, end, bounds }, index) => ({
    id: `input-focus-${index}`,
    startMs: Math.round(start * 1000),
    endMs: Math.round(end * 1000),
    depth: 3,
    customScale: Math.max(
      1,
      Math.floor(
        Math.min(1.8, frame.width / (bounds.width + 48), frame.height / (bounds.height + 48)) * 100,
      ) / 100,
    ),
    focus: {
      cx: (bounds.x + bounds.width / 2 + frame.left) / frame.width,
      cy: (bounds.y + bounds.height / 2 + frame.top) / frame.height,
    },
    focusMode: "manual",
    source: "manual",
  }));
}
