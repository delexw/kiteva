import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ConversationAttachments } from "../src/client/components/conversation-attachments";

it("shows saved documents, images, audio and video without duplicate attachments", () => {
  const assets = [
    { id: "document", originalName: "reference.pdf", bytes: 2048 },
    { id: "image", originalName: "reference.png", bytes: 1024 },
    { id: "audio", originalName: "reference.wav", bytes: 4096 },
    { id: "video", originalName: "reference.mp4", bytes: 8192 },
  ];
  const html = renderToStaticMarkup(
    <ConversationAttachments
      assetIds={[...assets.map((asset) => asset.id), "image"]}
      assets={assets}
    />,
  );
  for (const asset of assets) expect(html).toContain(asset.originalName);
  expect(html.match(/src="\/api\/assets\/image\/preview"/g)).toHaveLength(1);
  expect(html).not.toContain("/api/assets/document/preview");
  expect(html).not.toContain("/api/assets/audio/preview");
  expect(html).not.toContain("/api/assets/video/preview");
  expect(html).not.toContain("<audio");
  expect(html).not.toContain("<video");
});

it("keeps an attachment visible when its metadata is unavailable", () => {
  expect(
    renderToStaticMarkup(<ConversationAttachments assetIds={["saved-file"]} assets={[]} />),
  ).toContain("saved-file");
  expect(renderToStaticMarkup(<ConversationAttachments assetIds={[]} assets={[]} />)).toBe("");
});
