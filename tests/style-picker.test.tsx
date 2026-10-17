import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StylePicker, StylePickerPreview } from "../src/client/components/style-picker";
const styles = [
  { id: "style-001", name_en: "Watercolor" },
  { id: "style-002", name_en: "Ink Wash" },
];
it("shows thumbnail previews alongside names in picker options", () => {
  const html = renderToStaticMarkup(<StylePickerPreview compact style={styles[0]} />);
  expect(html).toContain('src="/api/examples/style-001"');
  expect(html).toContain("Watercolor");
  expect(html).not.toContain("<video");
});
it("keeps selected style previews visible below the picker without exposing style numbers", () => {
  const html = renderToStaticMarkup(
    <StylePicker
      styles={styles}
      examples={[]}
      selectedIds={["style-002"]}
      limit={2}
      onChange={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Selected Motion Graphic previews"');
  expect(html).toContain('src="/api/examples/style-002"');
  expect(html).toContain("Ink Wash");
  expect(html).not.toContain('src="/api/examples/style-001"');
  expect(html).not.toContain(">style-002<");
});
it("does not show a selected preview gallery before choosing styles", () => {
  const html = renderToStaticMarkup(
    <StylePicker styles={styles} examples={[]} selectedIds={[]} limit={2} onChange={() => {}} />,
  );
  expect(html).not.toContain('aria-label="Selected Motion Graphic previews"');
  expect(html).toContain("lucide-layers");
  expect(html).toContain('aria-hidden="true"');
});
