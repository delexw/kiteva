import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { loadCatalog } from "../src/server/catalog/catalog";
import { styleMetadataMarkdown } from "../src/shared/style-metadata";
import { StyleMetadataCopy } from "../src/client/components/style-metadata-copy";

it("copies all five displayed sections and keeps scene-dependent backgrounds flexible", async () => {
  const style = (await loadCatalog()).styles.find((item) => item.id === "style-007")!;
  const text = styleMetadataMarkdown(style);
  for (const section of [
    "Color palette",
    "Visual direction",
    "Production responsibilities",
    "Palette constraints",
    "Audio direction",
  ])
    expect(text).toContain(`## ${section}`);
  expect(text).toContain(style.visual_cues);
  for (const constraint of style.palette.constraints) expect(text).toContain(constraint);
  expect(text).toContain(style.audio_direction.prompt);
  expect(text).toContain("Uses the project’s renderer setting");
  for (const [role, color] of Object.entries(style.palette.tokens))
    if (role !== "background" || style.palette.background_policy !== "scene_dependent")
      expect(text).toContain(color);
  expect(text).not.toContain(style.executable_prompt_template);
  const flexible = {
    ...style,
    palette: {
      tokens: { background: "#010203", foreground: "#ABCDEF" },
      constraints: [],
      background_policy: "scene_dependent" as const,
    },
  };
  expect(styleMetadataMarkdown(flexible)).toContain("Background follows the scene");
  expect(styleMetadataMarkdown(flexible)).not.toContain("#010203");
  expect(
    styleMetadataMarkdown({
      ...flexible,
      palette: { ...flexible.palette, background_policy: "fixed" },
    }),
  ).toContain("#010203");
});
it("uses the displayed language while preserving exact color values and is SSR safe", async () => {
  const style = (await loadCatalog()).styles[0];
  expect(styleMetadataMarkdown(style, (text) => `Translated: ${text}`)).toContain(
    "## Translated: Color palette",
  );
  expect(renderToStaticMarkup(<StyleMetadataCopy style={style} />)).toContain(
    "Copy style metadata",
  );
});
