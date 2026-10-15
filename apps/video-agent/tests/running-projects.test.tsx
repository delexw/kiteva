import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RunningProjects } from "../src/client/components/running-projects";
import { RequestSchema, type Run } from "../src/shared/contracts";
it("counts projects rather than their concurrent jobs and excludes settled projects", () => {
  const base: Run = {
    id: "active",
    request: RequestSchema.parse({ instructions: "A project" }),
    phase: "preparing",
    createdAt: "2026-01-01T00:00:00Z",
    jobs: [],
    candidates: [],
  };
  const html = renderToStaticMarkup(
    <RunningProjects
      projects={[base, { ...base, id: "finished", phase: "ready" }]}
      onOpen={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Running projects: 1"');
  expect(html).toContain('aria-expanded="false"');
});
it("keeps the monitor available when all projects finish", () => {
  expect(renderToStaticMarkup(<RunningProjects projects={[]} onOpen={() => {}} />)).toContain(
    'aria-label="Running projects: 0"',
  );
});
