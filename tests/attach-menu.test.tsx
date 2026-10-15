import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AttachMenu } from "../src/client/components/attach-menu";

it("offers a menu with separate multiple-file pickers for images and audio", () => {
  const html = renderToStaticMarkup(
    <AttachMenu uploading={false} onUpload={async () => {}} urls="" onUrlsChange={() => {}} />,
  );
  expect(html).toContain('aria-haspopup="menu"');
  expect(html).toContain("Attach");
  expect(html).toContain('aria-label="Upload reference files"');
  expect(html).toContain('accept="image/*"');
  expect(html).toContain('accept="audio/*"');
  expect(html.match(/type="file"/g)).toHaveLength(3);
  expect(html.match(/multiple=""/g)).toHaveLength(3);
});

it("disables the menu and every picker during upload", () => {
  const html = renderToStaticMarkup(
    <AttachMenu uploading onUpload={async () => {}} urls="" onUrlsChange={() => {}} />,
  );
  expect(html).toContain("Uploading…");
  expect(html.match(/disabled=""/g)).toHaveLength(4);
});

it("shows supplied URLs in the URL editor", () => {
  const html = renderToStaticMarkup(
    <AttachMenu
      uploading={false}
      onUpload={async () => {}}
      urls="https://example.com"
      onUrlsChange={() => {}}
    />,
  );
  expect(html).toContain("Website URLs");
  expect(html).toContain("https://example.com");
  expect(html).toContain('aria-label="Close URL editor"');
});
