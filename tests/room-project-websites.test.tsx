import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { RoomProject } from "../src/client/room/room-project";

function render(urls: string[], instructions = "") {
  const run: Run = {
    id: "example-project",
    createdAt: "2026-01-01T00:00:00Z",
    phase: "ready",
    request: RequestSchema.parse({
      instructions: "Explain a product",
      urls,
      ...(instructions
        ? {
            requirements: {
              main: { instructions: "", assetIds: [] },
              images: { instructions: "", assetIds: [] },
              music: { instructions: "", assetIds: [] },
              urls: { instructions },
            },
          }
        : {}),
    }),
    candidates: [],
    jobs: [],
  };
  return renderToStaticMarkup(
    <RoomProject
      run={run}
      events={[]}
      renderPreview={() => null}
      renderFull={() => null}
      controls={null}
      onQuestion={vi.fn()}
      onUpdated={vi.fn()}
      onEdit={vi.fn()}
      onCancel={vi.fn()}
      onRetry={vi.fn()}
      view={{ tab: "conversation", refine: "" }}
      onView={vi.fn()}
    />,
  );
}

it("shows website instructions and clickable URLs together in one Websites section", () => {
  const html = render(
    ["https://example.com/docs", "https://example.com/source"],
    "Investigate these sources thoroughly.",
  );
  expect(html.match(/>Websites</g)).toHaveLength(1);
  expect(html).toContain("Investigate these sources thoroughly.");
  for (const url of ["https://example.com/docs", "https://example.com/source"])
    expect(html).toContain(`href="${url}" target="_blank" rel="noreferrer"`);
});

it("shows URLs even when no website instructions or requirements were supplied", () => {
  const html = render(["https://example.com/docs"]);
  expect(html).toContain(">Websites<");
  expect(html).toContain('href="https://example.com/docs"');
});

it("keeps instructions-only website sections and omits empty ones", () => {
  expect(render([], "Read the supplied sources.")).toContain("Read the supplied sources.");
  expect(render([])).not.toContain(">Websites<");
});
