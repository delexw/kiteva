export interface OpenScreenTrimRegion {
  id: string;
  startMs: number;
  endMs: number;
}

export interface OpenScreenZoomRegion {
  id: string;
  startMs: number;
  endMs: number;
  depth: number;
  customScale?: number;
  focus: { cx: number; cy: number };
  focusMode: "auto" | "manual";
  source: "manual";
}
