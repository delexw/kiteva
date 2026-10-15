import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { MotionPatternSchema } from "../src/shared/contracts";
import { MotionCard } from "../src/client/motion-card";
const catalog = JSON.parse(
  readFileSync(new URL("../assets/catalog/motion-pattern-catalog.json", import.meta.url), "utf8"),
);
const motion = MotionPatternSchema.parse(catalog.patterns[0]);
describe("shared motion card", () => {
  it("uses the shared card and preview for explorer and reference variants", () => {
    const explorer = renderToStaticMarkup(<MotionCard motion={motion} onSelect={() => {}} />);
    const reference = renderToStaticMarkup(
      <MotionCard
        motion={motion}
        variant="compact"
        description="Scene-specific reveal guidance"
        onSelect={() => {}}
      />,
    );
    for (const html of [explorer, reference]) {
      expect(html).toContain(motion.name);
      expect(html).toContain("motion-preview");
      expect(html).not.toContain("swatches");
    }
    expect(explorer).toContain("style-card--explorer");
    expect(reference).toContain("style-card--compact");
    expect(reference).toContain("Scene-specific reveal guidance");
  });
});
