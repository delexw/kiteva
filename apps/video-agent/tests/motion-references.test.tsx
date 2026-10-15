import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { MotionPatternSchema } from "../src/shared/contracts";
import { MotionReferenceList } from "../src/client/motion-references";
import { loadMotionCatalog } from "../src/client/motion-catalog";
const catalog = JSON.parse(
  readFileSync(new URL("../assets/catalog/motion-pattern-catalog.json", import.meta.url), "utf8"),
);
const motion = MotionPatternSchema.parse(catalog.patterns[0]);
afterEach(() => vi.unstubAllGlobals());
describe("motion references", () => {
  it("renders named references, usage guidance, sequence and preview without raw JSON", () => {
    const html = renderToStaticMarkup(
      <MotionReferenceList
        motions={[motion]}
        references={{
          candidates: [{ motion_id: motion.id, usage_guidance: "Reveal a flower-filled doorway." }],
          required: false,
        }}
      />,
    );
    expect(html).toContain(motion.name);
    expect(html).toContain("Reveal a flower-filled doorway.");
    expect(html).toContain("Motion sequence and video adaptation");
    expect(html).toContain("<canvas");
    expect(html).toContain("style-card--compact");
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("motion_id");
  });
  it("handles empty and unavailable references visibly", () => {
    expect(
      renderToStaticMarkup(<MotionReferenceList motions={[]} references={{ candidates: [] }} />),
    ).toContain("No motion references suggested");
    expect(
      renderToStaticMarkup(
        <MotionReferenceList
          motions={[]}
          references={{
            candidates: [{ motion_id: "unknown", usage_guidance: "Example guidance" }],
          }}
        />,
      ),
    ).toContain("Motion reference unavailable");
  });
  it("validates the catalog and forwards cancellation", async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [motion] });
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadMotionCatalog(signal)).toEqual([motion]);
    expect(fetchMock).toHaveBeenCalledWith("/api/motions", { signal });
    fetchMock.mockResolvedValue({ ok: false });
    await expect(loadMotionCatalog(signal)).rejects.toThrow("Could not load motion library");
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: "invalid" }] });
    await expect(loadMotionCatalog(signal)).rejects.toThrow();
  });
});
