import { beforeMangaReferenceStudy } from "./fixtures/manga-reference-baseline";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/server/catalog/catalog";
import { technologyPool } from "../src/shared/technology-pool";
import { resolveStyleTechnology } from "../src/shared/style-technology";
import { validateTechnologyReview } from "../src/shared/technology-review";

describe("shared technology pool", () => {
  it("retains original source assignments and metadata while separating project renderers", async () => {
    const catalog = await loadCatalog();
    const fingerprints = JSON.parse(
      readFileSync(
        new URL("./fixtures/original-style-technology-fingerprints.json", import.meta.url),
        "utf8",
      ),
    );
    const originalStyles = catalog.originalStyles.slice(0, 115);
    const originalStackNames = JSON.parse(
      readFileSync(new URL("./fixtures/original-style-stack-names.json", import.meta.url), "utf8"),
    );
    const intentionallyUpdatedIds = new Set([
      "style-010",
      "style-029",
      "style-055",
      "style-057",
      "style-084",
      "style-094",
      "style-111",
      "style-060",
      "style-061",
      "style-062",
      "style-093",
      "style-095",
      "style-096",
      "style-105",
      "style-106",
    ]);
    expect(Object.keys(technologyPool)).toHaveLength(92);
    expect(new Set(Object.values(technologyPool).map((entry) => entry.name)).size).toBe(92);
    expect(
      catalog.originalStyles
        .slice(0, 115)
        .reduce(
          (count, style) =>
            count + (style.tech as { recommended_stack: unknown[] }).recommended_stack.length,
          0,
        ),
    ).toBeGreaterThanOrEqual(943);
    for (const style of originalStyles) {
      const current = catalog.styles.find((entry) => entry.id === style.id)!;
      expect(current.tech.recommended_stack.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(
          originalStackNames[String(style.id)].filter(
            (name: string) =>
              ![
                "HyperFrames",
                "Remotion",
                "@remotion/renderer",
                "Multiplane",
                "OpenScreen",
              ].includes(name),
          ),
        ),
      );
      if (intentionallyUpdatedIds.has(String(style.id))) continue;
      // This fingerprint predates the requested flexible-background policy.
      delete (style.palette as Record<string, unknown>).background_policy;
      delete (style.palette as Record<string, unknown>).source_frame_review;
      const preservedStyle = beforeMangaReferenceStudy(
        structuredClone(style) as {
          id: string;
          visual_cues: string;
          executable_prompt_template: string;
          tech: { implementation: string };
          motion_references?: { candidates: { motion_id: string }[] };
        },
      );
      if (preservedStyle.motion_references) {
        preservedStyle.motion_references.candidates =
          preservedStyle.motion_references.candidates.filter(
            (entry) =>
              ![
                "motion-037",
                "motion-038",
                "motion-039",
                "motion-040",
                "motion-041",
                "motion-042",
              ].includes(entry.motion_id),
          );
      }
      expect(createHash("sha256").update(JSON.stringify(preservedStyle)).digest("hex")).toBe(
        fingerprints[String(style.id)],
      );
    }
  });
  it("rejects unknown keys, duplicate references and orphan overrides", () => {
    expect(() => resolveStyleTechnology({ recommended_stack_keys: ["missing"] })).toThrow(
      /Unknown/,
    );
    expect(() => resolveStyleTechnology({ recommended_stack_keys: ["svg", "svg"] })).toThrow(
      /Duplicate/,
    );
    expect(() =>
      resolveStyleTechnology({
        recommended_stack_keys: ["svg"],
        stack_overrides: { gsap: { values: {}, remove: [] } },
      }),
    ).toThrow(/Unused/);
  });
  it("resolves style-specific overrides without changing shared definitions", () => {
    const original = structuredClone(technologyPool.svg);
    const tech = resolveStyleTechnology({
      recommended_stack_keys: ["svg"],
      stack_overrides: {
        svg: { values: { style_application: "Precise outlines", optional: true }, remove: [] },
      },
    });
    expect(tech.recommended_stack).toEqual([
      expect.objectContaining({
        name: "SVG",
        style_application: "Precise outlines",
        optional: true,
      }),
    ]);
    expect(technologyPool.svg).toEqual(original);
  });
  it("requires explicit assessment of every pool entry and every requested style", () => {
    const review = {
      assessments: Object.keys(technologyPool).map((key) => ({
        key,
        matchingStyleIds: key === "svg" || key === "gsap" ? ["style-116"] : [],
        reason: "Considered for the requested visual medium",
      })),
      styles: [
        {
          styleId: "style-116",
          rendererKeys: ["svg"],
          motionKeys: ["gsap"],
          supportingKeys: [],
          implementation: "Seekable path construction",
          rationale: "Precise geometry",
        },
      ],
    };
    expect(validateTechnologyReview(review, ["style-116"])).toEqual(review);
    expect(() =>
      validateTechnologyReview({ ...review, assessments: review.assessments.slice(1) }, [
        "style-116",
      ]),
    ).toThrow(/every pool key/);
    expect(() => validateTechnologyReview({ ...review, styles: [] }, ["style-116"])).toThrow(
      /every requested style/,
    );
    expect(() =>
      validateTechnologyReview(
        { ...review, styles: [{ ...review.styles[0], rendererKeys: ["hyperframes"] }] },
        ["style-116"],
      ),
    ).toThrow(/pipelines/);
  });
});

it("recommends optional Matter.js only for reviewed 2D physics uses and preserves existing stacks", async () => {
  const catalog = await loadCatalog();
  const matches = catalog.styles.filter((style) =>
    style.tech.recommended_stack.some((tool) => tool.name === "Matter.js"),
  );
  expect(matches.map((style) => style.id)).toEqual([
    "style-010",
    "style-029",
    "style-055",
    "style-057",
    "style-084",
    "style-093",
    "style-094",
    "style-095",
    "style-105",
    "style-106",
    "style-111",
    "style-136",
  ]);
  for (const style of matches) {
    const entry = style.tech.recommended_stack.find((tool) => tool.name === "Matter.js")!;
    expect(entry.optional).toBe(true);
    expect(entry.style_application).not.toBe(technologyPool.matter_js.style_application);
    expect(entry.selection_guidance).toContain("backward seeking");
    expect(entry.production_roles).toEqual(["motion_engine"]);
  }
  const source = JSON.parse(
    readFileSync(new URL("./fixtures/original-style-stack-names.json", import.meta.url), "utf8"),
  );
  for (const style of matches.filter((entry) => source[entry.id]))
    expect(style.tech.recommended_stack.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(
        source[style.id].filter(
          (name: string) =>
            !["HyperFrames", "Remotion", "@remotion/renderer", "Multiplane", "OpenScreen"].includes(
              name,
            ),
        ),
      ),
    );
});

it("keeps website recording independent of style technologies", async () => {
  const catalog = await loadCatalog();
  expect(Object.keys(technologyPool)).not.toContain("openscreen");
  expect(
    catalog.styles.some((style) =>
      style.tech.recommended_stack.some((tool) => tool.name === "OpenScreen"),
    ),
  ).toBe(false);
});
