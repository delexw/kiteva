import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestSchema, type Asset } from "../src/shared/contracts";
import { acceptsBriefAttachment } from "../src/shared/brief-sections";
import { validateBriefSections } from "../src/server/requests/brief-sections";
import {
  briefExplorationAgents,
  briefExplorationInstructions,
} from "../src/server/agents/brief-exploration";
import { BriefRequirements } from "../src/client/components/brief-requirements";
import { projectSettingsDraft } from "../src/client/lib/project-settings";
const documentId = randomUUID(),
  audioId = randomUUID(),
  imageId = randomUUID();
const request = () =>
  RequestSchema.parse({
    instructions: "Introduce the product",
    assetIds: [documentId, audioId, imageId],
    requirements: {
      main: { assetIds: [documentId] },
      music: { instructions: "Loop the soundtrack", assetIds: [audioId] },
      images: { instructions: "Use the product screen", assetIds: [imageId] },
      urls: { instructions: "Capture the editor" },
    },
  });
const getAsset = (id: string) =>
  ({
    id,
    name: id === documentId ? "brief.pdf" : id === audioId ? "music.mp3" : "screen.png",
  }) as Asset;
it("enforces section-specific formats and complete unique assignments at the server boundary", () => {
  expect(() => validateBriefSections(request(), getAsset)).not.toThrow();
  expect(acceptsBriefAttachment("main", "BRIEF.MD")).toBe(true);
  expect(acceptsBriefAttachment("main", "image.png")).toBe(false);
  expect(acceptsBriefAttachment("main", "brief.docx")).toBe(false);
  const duplicate = request();
  duplicate.requirements!.music.assetIds.push(documentId);
  expect(() => validateBriefSections(duplicate, getAsset)).toThrow("exactly one");
  const missing = request();
  missing.requirements!.images.assetIds = [];
  expect(() => validateBriefSections(missing, getAsset)).toThrow("Every attachment");
  expect(() =>
    validateBriefSections(request(), (id) => ({ ...getAsset(id), name: "unsupported.docx" })),
  ).toThrow("Unsupported attachment");
  expect(() =>
    validateBriefSections(
      RequestSchema.parse({ instructions: "Legacy brief with old documents" }),
      getAsset,
    ),
  ).not.toThrow();
});
it("restores section instructions without combining or losing them", () => {
  expect(projectSettingsDraft(request()).sectionInstructions).toEqual({
    music: "Loop the soundtrack",
    images: "Use the product screen",
    urls: "Capture the editor",
  });
});
it("provides four focused cheap-model agents, restricts browsing to the URL role, and requires grounded synthesis", () => {
  const agents = briefExplorationAgents("cheap-model");
  expect(Object.keys(agents)).toEqual([
    "main-brief",
    "music-requirements",
    "image-requirements",
    "url-requirements",
  ]);
  for (const agent of Object.values(agents)) {
    expect(agent.model).toBe("cheap-model");
    expect(agent.tools).not.toContain("Agent");
    expect(agent.tools).not.toContain("Bash");
  }
  expect(agents["url-requirements"].tools).toContain("mcp__reference_browser__capture_screenshot");
  expect(agents["main-brief"].prompt).toContain("complete extracted text");
  expect(agents["music-requirements"].prompt).toContain("Do not infer instruments");
  expect(agents["image-requirements"].prompt).toContain("inspect every assigned image");
  expect(briefExplorationInstructions).toContain("sequentially");
  expect(briefExplorationInstructions).toContain("scene-to-asset mapping");
});
it("renders section-specific upload controls and keeps each attachment in its assigned section", () => {
  const html = renderToStaticMarkup(
    <BriefRequirements
      instructions={{ music: "Loop", images: "Screen", urls: "Editor" }}
      onChange={() => {}}
      assets={[
        { id: audioId, originalName: "music.mp3", section: "music" },
        { id: imageId, originalName: "reference.jpg", section: "images" },
      ]}
      onRemove={() => {}}
      uploading={false}
      onUpload={async () => {}}
      urls="https://example.com"
      onUrlsChange={() => {}}
    >
      <textarea aria-label="Main prompt" />
    </BriefRequirements>,
  );
  expect(html).toContain('accept=".md,.txt,.pdf"');
  expect(html).toContain('accept=".wav,.mp3,.m4a"');
  expect(html).toContain("Add links");
  expect(html.indexOf("music.mp3")).toBeGreaterThan(
    html.indexOf('aria-label="Music / instrumental requirements"'),
  );
  expect(html.indexOf("music.mp3")).toBeLessThan(html.indexOf('aria-label="Image requirements"'));
  expect(html).toContain(`src="/api/assets/${imageId}/preview"`);
  expect(html).toContain('alt="reference.jpg"');
  expect(html).toContain('aria-label="Remove reference.jpg"');
  expect(html).toContain('aria-label="Image requirements"');
});
