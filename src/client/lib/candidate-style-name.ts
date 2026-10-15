import type { Style, StyleCandidate } from "../../shared/contracts";

export function candidateStyleName(
  candidate: Pick<StyleCandidate, "primaryStyleId" | "supportingStyleIds"> | undefined,
  styles: Pick<Style, "id" | "name_en">[],
): string {
  if (!candidate) return "Your direction";
  return [candidate.primaryStyleId, ...candidate.supportingStyleIds]
    .map((id) => styles.find((style) => style.id === id)?.name_en || id)
    .join(" + ");
}
