import type { recordingEdit } from "./recording-edit";

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

/** OpenScreen v2.1.1's native document preserves 3D/impact settings that its v2 loader drops. */
export function createOpenScreenProject(
  source: string,
  duration: number,
  dimensions: { width: number; height: number },
  editor: Record<string, unknown> & {
    trimRegions: ReturnType<typeof recordingEdit>;
    zoomRegions: OpenScreenZoomRegion[];
  },
) {
  const createdAt = new Date().toISOString();
  const assetId = "capture-source";
  const clipId = "capture-clip";
  const { trimRegions, zoomRegions, ...legacyEditor } = editor;
  return {
    schemaVersion: 8,
    project: {
      id: "capture-project",
      title: "Website capture",
      createdAt,
      updatedAt: createdAt,
      primaryAssetId: assetId,
    },
    assets: [
      {
        id: assetId,
        kind: "video",
        label: "Website capture",
        originalPath: source,
        durationSec: duration,
        video: { ...dimensions, codec: "unknown", fps: 0 },
      },
    ],
    timeline: {
      clips: [
        {
          id: clipId,
          assetId,
          sourceStartSec: 0,
          sourceEndSec: duration,
          timelineStartSec: 0,
          timelineEndSec: duration,
          origin: "agent",
        },
      ],
      trimRanges: trimRegions.map((trim) => ({
        id: trim.id,
        assetId,
        clipId,
        startSec: trim.startMs / 1000,
        endSec: trim.endMs / 1000,
        origin: "agent",
      })),
    },
    zoomRanges: zoomRegions.map((zoom) => ({
      ...zoom,
      clipId,
      sourceStartSec: zoom.startMs / 1000,
      sourceEndSec: zoom.endMs / 1000,
    })),
    legacyEditor,
  };
}
