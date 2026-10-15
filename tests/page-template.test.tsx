import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageTemplate } from "../src/client/components/page-template";

it("keeps page actions and controls in the shared header while content remains separate", () => {
  const markup = renderToStaticMarkup(
    <PageTemplate
      title="Library"
      eyebrow="Workspace / Library"
      description={<p>Explore entries.</p>}
      actions={<button>Refresh</button>}
      controls={<input aria-label="Search entries" />}
    >
      <article>Entry content</article>
    </PageTemplate>,
  );
  const headerEnd = markup.indexOf("</header>");
  expect(markup.indexOf("Refresh")).toBeLessThan(headerEnd);
  expect(markup.indexOf("Search entries")).toBeLessThan(headerEnd);
  expect(markup.indexOf("Entry content")).toBeGreaterThan(headerEnd);
  expect(markup).toContain("<h1>Library</h1>");
});

it("supports compact pages without optional header sections and preserves project layout classes", () => {
  const markup = renderToStaticMarkup(
    <PageTemplate title="Project" eyebrow="Workspace" className="project-page-template">
      <div>Conversation</div>
    </PageTemplate>,
  );
  expect(markup).toContain('class="page-template project-page-template"');
  expect(markup).not.toContain("page-template-description");
  expect(markup).not.toContain("page-template-controls");
});
