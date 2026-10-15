import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectList } from "../src/client/components/project-list";
import { RequestSchema, type Run } from "../src/shared/contracts";
it("keeps project deletion disabled until the project settles and preserves open controls", () => {
  const project: Run = {
    id: "project-id",
    createdAt: "2026-01-01T00:00:00Z",
    phase: "preparing",
    request: RequestSchema.parse({ instructions: "A generic idea" }),
    jobs: [],
    candidates: [],
  };
  const active = renderToStaticMarkup(
    <ProjectList projects={[project]} onOpen={() => {}} onDelete={() => {}} />,
  );
  expect(active).toContain('aria-label="Delete project: A generic idea"');
  expect(active).toContain('disabled=""');
  expect(active).toContain("recent-project-open");
  expect(active).toContain("Full result status");
  const ready = renderToStaticMarkup(
    <ProjectList
      projects={[{ ...project, phase: "ready" }]}
      onOpen={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(ready).not.toContain('disabled=""');
});
it("shows the existing empty-state guidance", () => {
  expect(
    renderToStaticMarkup(<ProjectList projects={[]} onOpen={() => {}} onDelete={() => {}} />),
  ).toContain("Your first project starts with an idea.");
});

it("uses thumbnail-first grid cards with collapsed settings and compact management actions", () => {
  const project: Run = {
    id: "project-id",
    createdAt: "2026-01-01T00:00:00Z",
    phase: "ready",
    request: RequestSchema.parse({ instructions: "A generic idea" }),
    jobs: [],
    candidates: [],
  };
  const html = renderToStaticMarkup(
    <ProjectList
      projects={[project, { ...project, id: "second-project" }]}
      onOpen={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
    />,
  );
  expect(html).toContain("recent-projects-grid");
  expect(html.match(/class="recent-project-info"/g)).toHaveLength(2);
  expect(html.indexOf("recent-project-media")).toBeLessThan(html.indexOf("recent-project-heading"));
  expect(html).toContain('aria-label="Open project: A generic idea"');
  expect(html).toContain('aria-label="Edit settings for A generic idea"');
  expect(html).toContain("<summary>Settings</summary>");
  expect(html).not.toContain("<aside");
  expect(html).not.toContain(' open=""');
});
