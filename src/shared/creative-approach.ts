import { z } from "zod";

export const CreativeApproachSchema = z.enum(["context", "creative", "random"]);
export type CreativeApproach = z.infer<typeof CreativeApproachSchema>;
export const creativeApproaches = {
  context: {
    label: "Follow my brief",
    description: "Follow my brief: choose visuals that stay close to your message.",
  },
  creative: {
    label: "Explore creative ideas",
    description: "Explore creative ideas: try unexpected visuals while keeping your message.",
  },
  random: {
    label: "Random selection",
    description:
      "Draw Motion Graphics uniformly from the full pool. No scores, weights or preference history. Build around your brief and the random draw.",
  },
} satisfies Record<CreativeApproach, { label: string; description: string }>;

/** Explicit selections bypass automatic creative exploration. */
export function creativeApproachLabel(request: {
  preference: CreativeApproach;
  selectedStyleIds?: string[];
}) {
  return request.selectedStyleIds?.length
    ? "Selected Motion Graphics"
    : creativeApproaches[request.preference].label;
}
