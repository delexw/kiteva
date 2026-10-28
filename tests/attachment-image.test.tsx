import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AttachmentImage } from "../src/client/components/attachment-image";

it("uses one encoded preview URL and accessible label for reference images", () => {
  const html = renderToStaticMarkup(
    <AttachmentImage assetId="example/image" label="Example reference" />,
  );
  expect(html).toContain('src="/api/assets/example%2Fimage/preview"');
  expect(html).toContain('alt="Example reference"');
  expect(html).toContain('width="96"');
  expect(html).toContain('height="96"');
  expect(html).toContain("ant-image-cover");
});

it("allows shelf selection without opening a preview", () => {
  const html = renderToStaticMarkup(
    <AttachmentImage assetId="example" label="" size={48} preview={false} />,
  );
  expect(html).toContain('width="48"');
  expect(html).not.toContain("ant-image-cover");
});
