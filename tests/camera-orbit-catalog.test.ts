import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { catalogRoot } from "../src/server/runtime/config";
import { loadCatalog } from "../src/server/catalog/catalog";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Later, separately reviewed additions (mg-frame-findings): new motions, their style links,
// optional motion variants and optional Motion Graphic variants. Stripping only these keeps
// the orbit review's original hashes meaningful for all prior content.
const laterMotionIds = ["motion-044", "motion-045", "motion-046", "motion-047", "motion-048"];
// Motion Graphics authored after the orbit review were not part of it and must not claim motion-043.
const laterStyleIds = ["style-137", "style-138"];
const withoutLaterMotionAdditions = (pattern: Record<string, unknown>) => {
  const { variants: _variants, ...rest } = pattern;
  return rest;
};
it("records the Opus orbit assessment and attaches only approved Motion Graphics without changing prior content", async () => {
  const catalog = await loadCatalog();
  const catalogSource = JSON.parse(
    await readFile(path.join(catalogRoot, "video-style-catalog.json"), "utf8"),
  );
  const raw = {
    ...catalogSource,
    styles: catalogSource.styles.filter(
      (style: { id: string }) => !laterStyleIds.includes(style.id),
    ),
  };
  for (const style of catalogSource.styles.filter((entry: { id: string }) =>
    laterStyleIds.includes(entry.id),
  ))
    expect(
      style.motion_references.candidates.map((entry: { motion_id: string }) => entry.motion_id),
    ).not.toContain("motion-043");
  const motionCatalog = JSON.parse(
    await readFile(path.join(catalogRoot, "motion-pattern-catalog.json"), "utf8"),
  );
  const review = JSON.parse(
    await readFile(path.join(catalogRoot, "reviews/camera-orbit-360.json"), "utf8"),
  );
  expect(review.model).toBe("claude-opus-5-5");
  expect(review.sessionId).toEqual(expect.any(String));
  expect(review.sessionId.length).toBeGreaterThan(10);
  expect(review.styleReviews).toHaveLength(raw.styles.length);
  expect(new Set(review.styleReviews.map((row: { styleId: string }) => row.styleId)).size).toBe(
    raw.styles.length,
  );
  const orbit = catalog.motions.find((motion) => motion.id === "motion-043")!;
  expect(orbit.name).toContain("360");
  expect(orbit.category).toBe("camera_motion");
  expect(orbit.source_evidence).toMatchObject({
    source_kind: "conversation_inspired",
    review_model: "claude-opus-5-5",
    review_session_id: review.sessionId,
  });
  const originalMotions = {
    ...motionCatalog,
    patterns: motionCatalog.patterns
      .filter(
        (motion: { id: string }) =>
          motion.id !== "motion-043" && !laterMotionIds.includes(motion.id),
      )
      .map(withoutLaterMotionAdditions),
  };
  expect(motionCatalog.metadata.pattern_count).toBe(motionCatalog.patterns.length);
  originalMotions.metadata = {
    ...motionCatalog.metadata,
    pattern_count: review.originalPatternCount,
  };
  expect(hash(originalMotions)).toBe(review.originalMotionCatalogHash);
  for (const style of raw.styles) {
    const row = review.styleReviews.find(
      (entry: { styleId: string }) => entry.styleId === style.id,
    );
    expect(row, style.id).toBeDefined();
    expect(row.reason.length).toBeGreaterThan(20);
    const references = style.motion_references.candidates.filter(
      (entry: { motion_id: string }) => entry.motion_id === "motion-043",
    );
    expect(references).toHaveLength(row.decision === "attach" ? 1 : 0);
    if (row.decision === "attach") expect(references[0].usage_guidance).toBe(row.usageGuidance);
    const originalReferences = {
      ...style.motion_references,
      candidates: style.motion_references.candidates.filter(
        (entry: { motion_id: string }) =>
          entry.motion_id !== "motion-043" && !laterMotionIds.includes(entry.motion_id),
      ),
    };
    expect(hash(originalReferences)).toBe(row.originalReferencesHash);
    const {
      motion_references: _references,
      motion_graphic_variants: _variants,
      ...metadata
    } = style;
    expect(hash(metadata)).toBe(row.originalMetadataHash);
  }
  expect(review.styleReviews.some((row: { decision: string }) => row.decision === "attach")).toBe(
    true,
  );
  expect(review.styleReviews.some((row: { decision: string }) => row.decision === "omit")).toBe(
    true,
  );
});
