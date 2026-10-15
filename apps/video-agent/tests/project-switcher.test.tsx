import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectSwitcher } from "../src/client/components/project-switcher";
import { RequestSchema, type Run } from "../src/shared/contracts";

it("shows distinct project badges and identifies only the active project", () => {
  const projects: Run[] = ["First project", "Second project"].map((instructions, index) => ({
    id: String(index),
    createdAt: new Date().toISOString(),
    phase: "ready",
    request: RequestSchema.parse({ instructions }),
    candidates: [],
    jobs: [],
  }));
  const html = renderToStaticMarkup(
    <ProjectSwitcher projects={projects} activeId="1" onSelect={() => {}} onNew={() => {}} />,
  );
  expect(html).toContain('aria-label="Projects"');
  expect(html).toContain("First project");
  expect(html).toContain("Second project");
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).toContain("New project");
});
it("omits project navigation when no projects exist", () => {
  expect(
    renderToStaticMarkup(<ProjectSwitcher projects={[]} onSelect={() => {}} onNew={() => {}} />),
  ).toBe("");
});
