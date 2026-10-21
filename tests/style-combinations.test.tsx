import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { validateCombinationReview } from "../src/shared/style-combinations";
import { SuggestedCombinations } from "../src/client/style-combinations";
import { loadCatalog } from "../src/server/catalog/catalog";
import { pageStyleContext } from "../src/server/domains/page/prompts";

const combinations = {
  selection_guidance:
    "Use alone for simple content; add diagrams when relationships need explanation.",
  suggestions: [
    {
      supporting_styles: [{ style_id: "style-002", role: "Draw explanatory diagrams" }],
      rationale: "Diagrams complement the primary typography.",
      best_for: "Explaining connected ideas",
      video_application: "Reveal the diagram during the explanation.",
      html_application: "Allow keyboard-accessible exploration.",
      consistency_rules: ["Preserve the primary palette."],
      avoid: ["Conflicting typography."],
    },
  ],
};
const review = { styles: [{ style_id: "style-001", suggested_combinations: combinations }] };
describe("style combination recommendations", () => {
  it("includes combination guidance for every catalog style", async () => {
    const catalog = await loadCatalog();
    expect(catalog.styles).toHaveLength(140);
    for (const style of catalog.styles) {
      expect(style.suggested_combinations?.selection_guidance).toBeTruthy();
      expect(style.suggested_combinations?.suggestions.length).toBeLessThanOrEqual(3);
    }
    expect(catalog.combination_analysis).toMatchObject({ model: "claude-opus-5-5" });
  });
  it("requires complete unique coverage and valid subordinate styles", () => {
    expect(validateCombinationReview(review, ["style-001"], ["style-001", "style-002"])).toEqual(
      review,
    );
    expect(() =>
      validateCombinationReview(review, ["style-001", "style-002"], ["style-001", "style-002"]),
    ).toThrow(/cover/);
    expect(() =>
      validateCombinationReview(
        { styles: [...review.styles, ...review.styles] },
        ["style-001", "style-002"],
        ["style-001", "style-002"],
      ),
    ).toThrow(/cover/);
    for (const ids of [["style-001"], ["unknown"], ["style-002", "style-002"]]) {
      const invalid = {
        styles: [
          {
            style_id: "style-001",
            suggested_combinations: {
              ...combinations,
              suggestions: [
                {
                  ...combinations.suggestions[0],
                  supporting_styles: ids.map((style_id) => ({ style_id, role: "Supporting role" })),
                },
              ],
            },
          },
        ],
      };
      expect(() =>
        validateCombinationReview(invalid, ["style-001"], ["style-001", "style-002"]),
      ).toThrow(/Invalid/);
    }
  });
  it("rejects duplicate combinations but permits a justified standalone style", () => {
    expect(() =>
      validateCombinationReview(
        {
          styles: [
            {
              style_id: "style-001",
              suggested_combinations: {
                ...combinations,
                suggestions: [...combinations.suggestions, ...combinations.suggestions],
              },
            },
          ],
        },
        ["style-001"],
        ["style-001", "style-002"],
      ),
    ).toThrow(/Duplicate/);
    expect(
      validateCombinationReview(
        {
          styles: [
            { style_id: "style-001", suggested_combinations: { ...combinations, suggestions: [] } },
          ],
        },
        ["style-001"],
        ["style-001"],
      ).styles,
    ).toHaveLength(1);
  });
  it("renders recommendations as named styles and readable guidance for both outputs", async () => {
    const catalog = await loadCatalog();
    const style = { ...catalog.styles[0], suggested_combinations: combinations };
    const html = renderToStaticMarkup(
      <SuggestedCombinations style={style} styles={catalog.styles} onSelect={() => {}} />,
    );
    expect(html).toContain("Suggested combinations");
    expect(html).toContain(catalog.styles[1].name_en);
    expect(html).toContain(`${style.name_en} + ${catalog.styles[1].name_en}`);
    expect(html).toContain("ant-collapse");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Preserve the primary palette.");
    expect(html).not.toContain("Video:");
    expect(html).not.toContain("HTML:");
    expect(html).not.toContain("supporting_styles");
    expect(pageStyleContext(style).suggested_combinations).toEqual(combinations);
    expect(
      renderToStaticMarkup(
        <SuggestedCombinations
          style={{ ...style, suggested_combinations: undefined }}
          styles={catalog.styles}
          onSelect={() => {}}
        />,
      ),
    ).toBe("");
  });
  it("shows primary and supporting posters before viewport activation", async () => {
    const catalog = await loadCatalog();
    const style = { ...catalog.styles[0], suggested_combinations: combinations };
    const examples = [style, catalog.styles[1]].map((item) => ({
      styleId: item.id,
      catalogHash: catalog.hash,
      thumbnail: "preview.svg",
      video: "preview.mp4",
      status: "ready" as const,
      generatedAt: "2026-01-01T00:00:00Z",
    }));
    const html = renderToStaticMarkup(
      <SuggestedCombinations
        style={style}
        styles={catalog.styles}
        examples={examples}
        onSelect={() => {}}
      />,
    );
    expect(html).not.toContain("<video");
    expect(html.match(/<img/g)).toHaveLength(2);
    for (const item of [style, catalog.styles[1]]) {
      expect(html).toContain(`/api/examples/${item.id}?version=`);
      expect(html).toContain(`data-style-id="${item.id}"`);
    }
    expect(html).toContain("Individual Motion Graphic previews");
    expect(html.indexOf("combination-preview-grid")).toBeLessThan(
      html.indexOf("combination-accordion"),
    );
  });
});

it("identifies application-authored recommendations without claiming a model review", async () => {
  const style = (await loadCatalog()).styles.find((entry) => entry.id === "style-136")!;
  const html = renderToStaticMarkup(
    <SuggestedCombinations style={style} styles={[]} onSelect={() => {}} />,
  );
  expect(html).toContain("Application-authored compatibility guidance");
  expect(html).not.toContain("analyzed by Claude");
});
