import { randomUUID } from "node:crypto";
import type { CreativeRequest, Style, StyleCandidate } from "../../shared/contracts";
import { CodedError } from "../../shared/errors";

export function manualDirection(request: CreativeRequest, styles: Style[]): StyleCandidate {
  const selected = (request.selectedStyleIds || []).map((id) => {
    const style = styles.find((entry) => entry.id === id);
    if (!style) throw new CodedError("INVALID_REQUEST", "Selected Motion Graphic does not exist");
    return style;
  });
  if (!selected.length) throw new CodedError("INVALID_REQUEST", "Choose a Motion Graphic first");
  return {
    id: randomUUID(),
    primaryStyleId: selected[0].id,
    supportingStyleIds: selected.slice(1).map((style) => style.id),
    sceneRoles: selected.map(
      (style, index) =>
        `${index === 0 ? "Primary identity" : "Supporting visual contribution"}: ${style.name_en}`,
    ),
    rationale: "Motion Graphics selected by you. No proposal or ranking call.",
    displayTitle: "Your selection",
    displayDescription: selected.map((style) => style.name_en).join(" + "),
    feasible: true,
    missingAssets: [],
    score: 0,
    confidence: 0,
    dimensions: {},
  };
}
