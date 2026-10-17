import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaletteSwatches, StyleCard, type StyleCardData } from "../src/client/style-card";
const style: StyleCardData = {
  id: "style-001",
  name_en: "Example visual Motion Graphic",
  category: "Illustration",
  visual_cues: "Bold geometry and readable typography",
  palette: { tokens: { background: "#FFFFFF", foreground: "#000000" }, constraints: [] },
};
describe("shared style card variants", () => {
  it.each([false, true])(
    "does not present a scene-dependent background as a color suggestion (compact: %s)",
    (compact) => {
      const html = renderToStaticMarkup(
        <PaletteSwatches
          tokens={{ background: "#FFF5DA", foreground: "#18243B", ochre: "#D8B54A" }}
          backgroundPolicy="scene_dependent"
          compact={compact}
        />,
      );
      expect(html).not.toContain("#FFF5DA");
      expect(html).not.toContain("Flexible background");
      if (!compact) expect(html).toContain("Background follows the scene");
      expect(html).toContain("#18243B");
      expect(html).toContain("#D8B54A");
    },
  );
  it("preserves an explicitly fixed background swatch", () => {
    const html = renderToStaticMarkup(
      <PaletteSwatches tokens={{ background: "#FFF5DA" }} backgroundPolicy="fixed" />,
    );
    expect(html).toContain("background #FFF5DA");
    expect(html).not.toContain("Background follows the scene");
  });
  it.each(["explorer", "compact"] as const)(
    "keeps scene-dependent %s cards free of background labels",
    (variant) => {
      const html = renderToStaticMarkup(
        <StyleCard
          variant={variant}
          style={{
            ...style,
            palette: {
              ...style.palette,
              tokens: { background: "#FFF5DA", foreground: "#18243B" },
              background_policy: "scene_dependent",
            },
          }}
          onSelect={() => {}}
        />,
      );
      expect(html).not.toContain("#FFF5DA");
      expect(html).not.toContain("Flexible background");
      expect(html).toContain("#18243B");
    },
  );
  it("shows every exact palette value with a visible label and rectangular swatch", () => {
    const tokens = { background: "#FFFFFF", foreground: "#000000", accent_secondary: "#3455db" };
    const html = renderToStaticMarkup(<PaletteSwatches tokens={tokens} />);
    expect(html).toContain('aria-label="Color palette"');
    expect(html.match(/class="palette-swatch-color"/g)).toHaveLength(3);
    expect(html).toContain("accent secondary");
    for (const value of Object.values(tokens)) expect(html).toContain(`>${value}</code>`);
  });
  it("places clickable color circles outside the style-opening button", () => {
    const html = renderToStaticMarkup(<StyleCard style={style} onSelect={() => {}} />);
    expect(html.match(/class="[^"]*palette-circle(?: |")/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Show color details: background #FFFFFF"');
    expect(html.indexOf("palette-circles")).toBeGreaterThan(html.indexOf("</button>"));
    expect(html).not.toContain("palette-swatch-value");
  });
  it("shows the palette without claiming generation when no saved example exists", () => {
    const html = renderToStaticMarkup(<StyleCard style={style} onSelect={() => {}} />);
    expect(html).toContain("No preview generated");
    expect(html).toContain("Palette only · no motion demo");
    expect(html).toContain("background:#FFFFFF");
    expect(html).not.toContain("GENERATING");
    expect(html).not.toContain("/api/examples");
  });
  it("renders explorer metadata with shared media and palette", () => {
    const html = renderToStaticMarkup(<StyleCard style={style} onSelect={() => {}} />);
    expect(html).toContain("style-card--explorer");
    expect(html).toContain("style-image");
    expect(html).toContain("example-media");
    expect(html).toContain(style.category);
    expect(html).toContain(style.visual_cues);
    expect(html).toContain("background #FFFFFF");
  });
  it("accepts motion media without inserting a style image or palette", () => {
    const html = renderToStaticMarkup(
      <StyleCard
        style={style}
        media={<canvas aria-label="Motion study" />}
        showPalette={false}
        onSelect={() => {}}
      />,
    );
    expect(html).toContain("Motion study");
    expect(html).not.toContain("/api/examples");
    expect(html).not.toContain("swatches");
  });
  it("uses the same card layout for compact suggestions with optional metadata", () => {
    const html = renderToStaticMarkup(
      <StyleCard style={style} variant="compact" onSelect={() => {}} />,
    );
    expect(html).toContain("style-card--compact");
    expect(html).toContain("style-image");
    expect(html).toContain(style.name_en);
    expect(html).not.toContain("style-category");
    expect(html).not.toContain(style.visual_cues);
    const expanded = renderToStaticMarkup(
      <StyleCard
        style={style}
        variant="compact"
        showCategory
        showDescription
        showId
        onSelect={() => {}}
      />,
    );
    expect(expanded).toContain(style.category);
    expect(expanded).toContain(style.visual_cues);
    expect(expanded).toContain(`<span>${style.id}</span>`);
  });
});

it("shows failed preparation rather than pretending a missing video is playing", () => {
  const html = renderToStaticMarkup(
    <StyleCard
      style={style}
      example={{
        styleId: style.id,
        catalogHash: "example",
        thumbnail: "example.webp",
        status: "ready",
        motionStatus: "needs_repair",
      }}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain("Motion needs repair");
  expect(html).not.toContain("Playing · 3s");
});
