import { beforeMangaReferenceStudy } from "./fixtures/manga-reference-baseline";
import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { catalogRoot } from "../src/server/runtime/config";

it("records all 405 decisions and adds exactly the approved references without changing styles", async () => {
  const current = JSON.parse(await readFile(`${catalogRoot}/video-style-catalog.json`, "utf8"));
  const before = JSON.parse(
    await readFile(
      new URL("./fixtures/catalog-reviews/styles-before.json", import.meta.url),
      "utf8",
    ),
  );
  const review = JSON.parse(
    await readFile(
      new URL("./fixtures/catalog-reviews/motion-reference-review.json", import.meta.url),
      "utf8",
    ),
  );
  expect(review.pairs).toHaveLength(405);
  expect(
    new Set(
      review.pairs.map(
        (pair: { styleId: string; motionId: string }) => `${pair.styleId}/${pair.motionId}`,
      ),
    ).size,
  ).toBe(405);
  let additions = 0;
  for (const style of current.styles.filter((entry: { id: string }) =>
    before.some((prior: { id: string }) => prior.id === entry.id),
  )) {
    const historicalStyle = beforeMangaReferenceStudy(style);
    const pairs = review.pairs.filter((pair: { styleId: string }) => pair.styleId === style.id);
    expect(pairs).toHaveLength(3);
    for (const pair of pairs) {
      expect(pair.reason.length).toBeGreaterThan(15);
      expect(pair.styleEvidence.text).toBe(historicalStyle.visual_cues);
      expect(pair.styleEvidence.sha256).toBe(
        createHash("sha256").update(historicalStyle.visual_cues).digest("hex"),
      );
      const reference = style.motion_references.candidates.find(
        (entry: { motion_id: string }) => entry.motion_id === pair.motionId,
      );
      expect(Boolean(reference)).toBe(pair.decision === "Add");
      if (reference) additions++;
    }
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
          "motion-049",
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
    // Ignore only the later background policy and timestamped frame evidence when checking this historical migration.
    delete style.palette.background_policy;
    delete style.palette.source_frame_review;
    expect(beforeMangaReferenceStudy(style)).toEqual(
      before.find((entry: { id: string }) => entry.id === style.id),
    );
  }
  expect(additions).toBe(142);
});

it("matches the complete 135-style Word Smash Cuts review to actual references", async () => {
  const catalog = JSON.parse(await readFile(`${catalogRoot}/video-style-catalog.json`, "utf8"));
  const review = JSON.parse(
    await readFile(
      new URL("./fixtures/catalog-reviews/word-smash-cuts-review.json", import.meta.url),
      "utf8",
    ),
  );
  expect(review.pairs).toHaveLength(135);
  expect(new Set(review.pairs.map((pair: { styleId: string }) => pair.styleId)).size).toBe(135);
  expect(review.references).toBe(20);
  for (const pair of review.pairs) {
    const style = catalog.styles.find((entry: { id: string }) => entry.id === pair.styleId);
    expect(pair.styleEvidence).toBe(beforeMangaReferenceStudy(style).visual_cues);
    const reference = style.motion_references.candidates.find(
      (entry: { motion_id: string }) => entry.motion_id === "motion-040",
    );
    expect(Boolean(reference)).toBe(pair.decision === "Add");
    if (reference) expect(reference.usage_guidance).toContain(pair.reason);
  }
});
