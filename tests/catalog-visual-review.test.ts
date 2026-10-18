import { beforeMangaReferenceStudy } from "./fixtures/manga-reference-baseline";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import chroma from "chroma-js";
import priorFingerprints from "./fixtures/prior-catalog-style-fingerprints.json";
import { loadCatalog } from "../src/server/catalog/catalog";

describe("Visual gallery additions", () => {
  it("preserves every prior style and its palette and technology assignments", async () => {
    const { readFile } = await import("node:fs/promises");
    const { catalogRoot } = await import("../src/server/runtime/config");
    const raw = JSON.parse(await readFile(`${catalogRoot}/video-style-catalog.json`, "utf8"));
    for (const [id, expected] of Object.entries(priorFingerprints)) {
      const style = raw.styles.find((entry: { id: string }) => entry.id === id);
      // Background flexibility is an intentional later policy change; source swatches stay intact.
      delete style.palette.background_policy;
      delete style.palette.source_frame_review;
      style.motion_references.candidates = style.motion_references.candidates.filter(
        (entry: { motion_id: string }) =>
          ![
            "motion-037",
            "motion-038",
            "motion-039",
            "motion-040",
            "motion-041",
            "motion-042",
            "motion-043",
            "motion-044",
            "motion-045",
            "motion-046",
            "motion-047",
            "motion-048",
          ].includes(entry.motion_id),
      );
      // Optional Motion Graphic variants are a later additive field (mg-frame-findings).
      delete style.motion_graphic_variants;
      // Matter.js and OpenScreen are intentional additive stack changes; compare all prior content unchanged.
      style.tech.recommended_stack_keys = style.tech.recommended_stack_keys.filter(
        (key: string) => !["matter_js", "openscreen"].includes(key),
      );
      delete style.tech.stack_overrides.matter_js;
      delete style.tech.stack_overrides.openscreen;
      expect(
        createHash("sha256")
          .update(JSON.stringify(beforeMangaReferenceStudy(style)))
          .digest("hex"),
        id,
      ).toBe(expected);
    }
  });
  it("keeps observed color families distinct from authored default hex values", async () => {
    const catalog = await loadCatalog();
    for (const id of ["129", "130", "131", "132", "133", "134", "135"]) {
      const style = catalog.styles.find((entry) => entry.id === `style-${id}`)!;
      expect(style.palette.background_evidence).toMatchObject({
        video_frames_inspected: true,
        exact_hex_from_source: false,
        source_urls: expect.arrayContaining([expect.stringContaining("/fable-5-5/")]),
      });
      expect(
        chroma.contrast(style.palette.tokens.foreground, style.palette.tokens.background),
      ).toBeGreaterThanOrEqual(4.5);
      expect(style.executable_prompt_template).toContain("STORYBOARD.json");
    }
  });
  it("distinguishes the added media from their closest existing treatments", async () => {
    const catalog = await loadCatalog();
    const rules = (id: string) => catalog.styles.find((entry) => entry.id === id)!.visual_cues;
    expect(rules("style-129")).toContain("horizontal registers");
    expect(rules("style-130")).toContain("decorated initial");
    expect(rules("style-131")).toContain("key-block contours");
    expect(rules("style-132")).toContain("several viewpoints");
    expect(rules("style-133")).toContain("Post-Impressionism");
    expect(rules("style-134")).toContain("Fine bounded outlines");
    expect(rules("style-135")).toContain("uneven rock field");
  });
});
