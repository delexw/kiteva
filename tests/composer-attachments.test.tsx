import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerAttachments } from "../src/client/components/composer-attachments";
const attachments = vi.hoisted(() => ({
  files: [] as { id: string; filename?: string }[],
  remove: vi.fn(),
}));
vi.mock("../src/client/components/ai-elements/prompt-input", () => ({
  usePromptInputAttachments: () => attachments,
}));
it("keeps the composer clear when no references are attached", () => {
  attachments.files = [];
  expect(renderToStaticMarkup(<ComposerAttachments />)).toBe("");
});
it("shows safe reference names with accessible non-submit removal actions", () => {
  attachments.files = [{ id: "reference-1", filename: "<brief>.txt" }, { id: "reference-2" }];
  const html = renderToStaticMarkup(<ComposerAttachments />);
  expect(html).toContain("&lt;brief&gt;.txt");
  expect(html).toContain('aria-label="Remove &lt;brief&gt;.txt"');
  expect(html).toContain('aria-label="Remove reference file"');
  expect(html.match(/type="button"/g)).toHaveLength(2);
});
