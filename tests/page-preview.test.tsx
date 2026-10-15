import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InteractivePagePreview } from "../src/client/domains/page/preview";
it("embeds page previews without same-origin access and honors mobile framing", () => {
  const html = renderToStaticMarkup(
    <InteractivePagePreview
      job={{
        outputType: "page",
        id: "job",
        runId: "run",
        candidateId: "option",
        kind: "preview",
        phase: "ready",
        workspace: "example",
        model: "test",
        page: "index.html",
      }}
      title="Example"
      viewport="mobile"
    />,
  );
  expect(html).toContain('sandbox="allow-scripts"');
  expect(html).not.toContain("allow-same-origin");
  expect(html).toContain("/api/pages/run/job/index.html");
  expect(html).toContain("page-preview-mobile");
  expect(html).toContain("aspect-ratio:390 / 844");
  expect(html).toContain("width:390px");
});

it("frames desktop previews at their actual desktop viewport", () => {
  const html = renderToStaticMarkup(
    <InteractivePagePreview
      job={{
        outputType: "page",
        id: "job",
        runId: "run",
        candidateId: "option",
        kind: "preview",
        phase: "ready",
        workspace: "example",
        model: "test",
      }}
      title="Example"
      viewport="desktop"
    />,
  );
  expect(html).toContain("width:1280px");
  expect(html).toContain("aspect-ratio:1280 / 1000");
});
