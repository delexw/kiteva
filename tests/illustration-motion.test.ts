import { IllustrationMotionSchema } from "../src/shared/agents/schemas/illustration-motion";
import { describe, it, expect } from "vitest";
import {
  annotateIllustration,
  illustrationMotionHtml,
  illustrationMotionPrompt,
} from "../src/server/motion/illustration-motion";
import { loadCatalog } from "../src/server/catalog/catalog";
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><defs><circle id="bulb" r="20"/></defs><rect width="1280" height="720" fill="#FFFFFF"/><g transform="translate(400 300)"><use href="#bulb" transform="scale(1.9)"/><text x="10" y="50">Idea</text></g></svg>';
const plan = {
  styleId: "style-011",
  selectedReferenceIds: [],
  rationale: "Pop the lightbulb inside the panel",
  tracks: [
    {
      actorId: "demo-actor-3",
      role: "Lightbulb",
      action: "transform" as const,
      start: 0.2,
      duration: 0.4,
      ease: "back.out(1.2)" as const,
      pose: { x: 0, y: 0, scale: 1.08, rotation: 0, opacity: 1 },
    },
  ],
};
describe("illustration-led motion", () => {
  it("preserves artwork order, definition IDs and original transforms when assigning actors", () => {
    const art = annotateIllustration(svg);
    expect(art).toContain('id="bulb"');
    expect(art).toContain('transform="scale(1.9)"');
    expect(art.indexOf("<rect")).toBeLessThan(art.indexOf("<g"));
    expect(art).toContain('data-demo-actor="demo-actor-3"');
    expect(art).not.toMatch(/id="bulb"[^>]*data-demo/);
  });
  it("animates only neutral wrappers and guards against missing, nested and background actors", () => {
    const html = illustrationMotionHtml(annotateIllustration(svg), plan);
    expect(html).toContain("wrapper.appendChild(el)");
    expect(html).toContain("Nested motion actors");
    expect(html).toContain("Background cannot");
    expect(html).toContain("scale(1.9)");
  });
  it("supports visible assembly and stroke drawing rather than only subtle transforms", () => {
    const reveal = IllustrationMotionSchema.parse({
      ...plan,
      tracks: [
        {
          ...plan.tracks[0],
          action: "reveal",
          pose: { x: 0, y: 24, scale: 0.75, rotation: 0, opacity: 0 },
        },
      ],
    });
    const html = illustrationMotionHtml(annotateIllustration(svg), reveal);
    expect(html).toContain("item.track.action==='reveal'");
    expect(html).toContain("strokeDashoffset");
    expect(html).toContain("Draw action needs visible unfilled stroked paths");
  });
  it("rejects large offsets and unsafe actor IDs", () => {
    expect(() =>
      IllustrationMotionSchema.parse({
        ...plan,
        tracks: [{ ...plan.tracks[0], actorId: "svg,script" }],
      }),
    ).toThrow();
    expect(() =>
      IllustrationMotionSchema.parse({
        ...plan,
        tracks: [{ ...plan.tracks[0], pose: { ...plan.tracks[0].pose, scale: 2 } }],
      }),
    ).toThrow();
  });
  it("requires inspecting actual image and artwork rather than inferring from the style name", async () => {
    const style = (await loadCatalog()).styles[10];
    const prompt = illustrationMotionPrompt([{ style, svg: "art.svg", image: "art.png" }]);
    expect(prompt).toContain("using Read");
    expect(prompt).toContain("imageFile");
    expect(prompt).toContain("Do not select actions from the Motion Graphic name alone");
    expect(prompt).toContain("no references is valid");
  });
});

it("allows drawing SVG lines whose default fill does not affect line rendering", () => {
  const html = illustrationMotionHtml(svg, plan);
  expect(html).toContain("p.localName==='line' || getComputedStyle(p).fill==='none'");
  expect(html).toContain("getComputedStyle(p).stroke!=='none'");
});
