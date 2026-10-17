export { CandidateCopySchema } from "./agents/schemas/candidate-copy";
export const candidateCopyGuidance = `For every direction, choose a naming tone from its actual visual character, primary and supporting Motion Graphic roles, pacing and the brief. A playful combination may call for a fun name; an editorial direction may call for a professional name; a vivid, fast-moving direction may call for an energetic name. Other tones, including creative or gaming-inspired, are welcome when they fit. Choose independently for each preview; do not force a different category onto every preview or apply one tone to them all. Also return displayTitle and displayDescription for the customer-facing preview card. displayTitle: a distinctive creative name of one or two words only, at most 24 characters, describing the idea, story or viewer experience. displayDescription: one clear sentence of roughly 12–24 words, at most 160 characters, describing what the viewer will see and how it serves the brief. Neither field may expose Motion Graphic names, Motion Graphic IDs, technology names, internal rankings, suggested-combination analysis or implementation details. Do not merely shorten or join the selected Motion Graphic names. Use plain language, avoid unsupported product claims, and give each direction a meaningfully different name. Keep detailed technical reasoning in rationale only.`;

export function candidateDisplayTitle(
  candidate: { displayTitle?: string } | undefined,
  directionNumber?: number,
) {
  return (
    candidate?.displayTitle?.trim() ||
    (directionNumber ? `Direction ${directionNumber}` : "Your direction")
  );
}
