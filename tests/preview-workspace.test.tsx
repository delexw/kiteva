import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildPreviewSpec,
  PreviewWorkspace,
  previewCatalog,
} from "../src/client/components/preview-workspace";

it("keeps each arriving candidate in the JSON layout in job order", () => {
  const spec = buildPreviewSpec(["pending", "ready"]);
  expect(previewCatalog.validate(spec).success).toBe(true);
  expect(spec.elements.grid.children).toEqual(["job-pending", "job-ready"]);
  expect(spec.elements["job-ready"].props).toEqual({ jobId: "ready" });
  expect(buildPreviewSpec([]).elements.grid.children).toEqual([]);
});

it("renders playable previews and selection alongside production controls without a dialog", () => {
  const html = renderToStaticMarkup(
    <PreviewWorkspace
      jobIds={["ready", "pending"]}
      controls={
        <label>
          Full video duration
          <input defaultValue="15" />
        </label>
      }
      renderCard={(id) =>
        id === "ready" ? (
          <article>
            <video controls src="/api/artifacts/preview.mp4" />
            <button>Choose &amp; build full video</button>
          </article>
        ) : (
          <article>Generating preview…</article>
        )
      }
    />,
  );
  expect(html).toContain('aria-label="Preview selection"');
  expect(html).toContain("Full video duration");
  expect(html).toContain("<video");
  expect(html).toContain("Choose &amp; build full video");
  expect(html).toContain("Generating preview…");
  expect(html).not.toContain('role="dialog"');
});

it("shows three loading cards before jobs arrive and replaces them with real job cards", () => {
  const pending = buildPreviewSpec([], 3, "Preparing your preview");
  expect(previewCatalog.validate(pending).success).toBe(true);
  expect(pending.elements.grid.children).toHaveLength(3);
  const html = renderToStaticMarkup(
    <PreviewWorkspace
      jobIds={[]}
      pendingCount={3}
      pendingStatus="Preparing your preview"
      controls={null}
      renderCard={() => null}
    />,
  );
  expect(html.match(/aria-busy="true"/g)).toHaveLength(3);
  expect(html).toContain("Direction 3");
  expect(html).toContain("Preparing your preview");
  expect(html).not.toContain("<video");
  const started = buildPreviewSpec(["one", "two", "three"], 3);
  expect(started.elements.grid.children).toEqual(["job-one", "job-two", "job-three"]);
  expect(started.elements["pending-0"]).toBeUndefined();
});
