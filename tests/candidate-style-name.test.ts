import { expect, it } from "vitest";
import { candidateStyleName } from "../src/client/lib/candidate-style-name";

const styles = [
  { id: "style-a", name_en: "Paper Cutout" },
  { id: "style-b", name_en: "Shape Morphing" },
  { id: "style-c", name_en: "Line Art" },
];
it("names the primary and all supporting styles in order", () => {
  expect(
    candidateStyleName(
      { primaryStyleId: "style-a", supportingStyleIds: ["style-b", "style-c"] },
      styles,
    ),
  ).toBe("Paper Cutout + Shape Morphing + Line Art");
});
it("keeps a single style title without a separator", () => {
  expect(candidateStyleName({ primaryStyleId: "style-a", supportingStyleIds: [] }, styles)).toBe(
    "Paper Cutout",
  );
});
it("preserves unresolved style IDs and handles a missing direction", () => {
  expect(
    candidateStyleName(
      { primaryStyleId: "style-a", supportingStyleIds: ["style-unknown"] },
      styles,
    ),
  ).toBe("Paper Cutout + style-unknown");
  expect(candidateStyleName(undefined, styles)).toBe("Your direction");
});
