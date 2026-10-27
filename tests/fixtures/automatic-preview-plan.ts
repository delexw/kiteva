import type { ContentBrief, StyleCandidate } from "../../src/shared/contracts";

export function automaticPreviewResult(context: unknown) {
  const { brief, directions } = context as { brief: ContentBrief; directions: StyleCandidate[] };
  return {
    value: {
      previewBeat: brief.previewBeat,
      directions: directions.map((direction) => ({
        id: direction.id,
        displayTitle: "Clear Reveal",
        displayDescription: "An idea becomes a readable result",
        sceneRoles: ["Establish the source, reveal its transformation, then hold the result"],
        rationale: "A representative beat explained through the selected styles",
      })),
    },
    sessionId: "shared-preview-planning-session",
  };
}
