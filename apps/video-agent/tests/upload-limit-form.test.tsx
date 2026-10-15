import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BriefRequirements } from "../src/client/components/brief-requirements";
import { hasReachedAssetCountLimit } from "../src/shared/asset-limits";
it("shows shared upload limits and disables only the full attachment category", () => {
  const names = Array.from({ length: 8 }, () => "image.png");
  expect(hasReachedAssetCountLimit(names, "images")).toBe(true);
  expect(hasReachedAssetCountLimit(names, "audio")).toBe(false);
  expect(
    hasReachedAssetCountLimit([...names, "a.mp3", "b.mp3", "a.pdf", "b.pdf"], "documents"),
  ).toBe(true);
  const html = renderToStaticMarkup(
    <BriefRequirements
      instructions={{ music: "", images: "", urls: "" }}
      onChange={() => {}}
      assets={names.map((originalName, i) => ({ id: String(i), originalName, section: "images" }))}
      onRemove={() => {}}
      uploading={false}
      onUpload={async () => {}}
      urls=""
      onUrlsChange={() => {}}
    >
      {null}
    </BriefRequirements>,
  );
  expect(html).toContain("Up to 8 images");
  expect(html).toContain("10 minutes");
  expect(html).toContain("100 MB total");
  expect(html.match(/disabled=""/g)).toHaveLength(2);
});
