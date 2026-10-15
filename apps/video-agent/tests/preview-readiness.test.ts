import { describe, expect, it } from "vitest";
import { isCurrentStylePreview, type StyleVideo } from "../src/server/catalog/style-motion";
import { illustrationMotionRevision } from "../src/server/motion/illustration-motion";
const art = { styleId: "style-001", generatedAt: "2026-01-01T00:00:00.000Z" };
const clip: StyleVideo = {
  styleId: art.styleId,
  catalogHash: "catalog",
  sourceHash: "source",
  video: "preview.mp4",
  duration: 3,
  generatedAt: "2026-01-01T00:01:00.000Z",
  renderMs: 100,
  reviewed: true,
  motionRevision: illustrationMotionRevision,
  model: "claude-opus-5-5",
};
describe("published preview readiness", () => {
  it("keeps a current reviewed Claude preview instead of regenerating it", () => {
    expect(isCurrentStylePreview(clip, art)).toBe(true);
    expect(isCurrentStylePreview({ ...clip, catalogHash: "previous-metadata" }, art)).toBe(true);
  });
  it("requires repair for missing, stale, unreviewed or wrong-provider clips", () => {
    expect(isCurrentStylePreview(undefined, art)).toBe(false);
    for (const changed of [
      { styleId: "style-002" },
      { reviewed: false },
      { motionRevision: 0 },
      { model: "gpt-6.1-sol" },
      { generatedAt: "2025-01-01T00:00:00.000Z" },
    ])
      expect(isCurrentStylePreview({ ...clip, ...changed }, art)).toBe(false);
    expect(isCurrentStylePreview(clip, { ...art, generatedAt: undefined })).toBe(false);
  });
});

it("accepts explicit application-authored artwork without relabelling it as model output", async () => {
  const { isReadyStyleExample, examplePage } = await import("../src/server/catalog/style-examples");
  const authored = {
    styleId: "style-136",
    catalogHash: "catalog",
    thumbnail: "style-136.webp",
    status: "ready" as const,
    authorship: "application" as const,
    model: "application-authored",
  };
  expect(isReadyStyleExample(authored)).toBe(true);
  expect(isReadyStyleExample({ ...authored, authorship: undefined })).toBe(false);
  expect(isReadyStyleExample({ ...authored, status: "failed" })).toBe(false);
  expect(isCurrentStylePreview({ ...clip, model: "application-authored" }, art)).toBe(true);
  expect(examplePage("style-136", true, true)).toContain("Application-authored illustrative");
});
