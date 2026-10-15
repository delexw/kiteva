import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import {
  ProjectResultPending,
  productionSetScale,
  productionSetSize,
} from "../src/client/components/project-result-pending";
import { roomColors } from "../src/client/theme";
import { RequestSchema, type Run, type GenerationJob } from "../src/shared/contracts";
const project: Run = {
  id: "example",
  request: RequestSchema.parse({ instructions: "An original project" }),
  phase: "ready",
  createdAt: "2026-01-01",
  jobs: [],
  candidates: [],
};
const job = (kind: "preview" | "full", phase: GenerationJob["phase"]): GenerationJob => ({
  id: `${kind}-${phase}`,
  runId: project.id,
  model: "example-model",
  candidateId: "candidate",
  kind,
  phase,
  duration: 3,
  workspace: "/tmp/example",
});
it("shows the action needed instead of pretending an unstarted full build is loading", () => {
  const html = renderToStaticMarkup(
    <ProjectResultPending visible project={{ ...project, jobs: [job("preview", "ready")] }} />,
  );
  expect(html).toContain("Choose a direction");
  expect(html).toContain('class="production-waiting-dots is-visible"');
  expect(html).toMatch(/production-waiting-dots[^>]*><i><\/i><i><\/i><i><\/i><\/span>/);
  expect(
    renderToStaticMarkup(
      <ProjectResultPending
        visible={false}
        project={{ ...project, jobs: [job("preview", "ready")] }}
      />,
    ),
  ).toContain('class="production-waiting-dots "');
  expect(html).not.toContain("Production stages");
  expect(html).not.toContain("Open the project");
  expect(html).not.toContain("is-working");
});
it("animates only visible active work and reports real preview counts", () => {
  const run = {
    ...project,
    phase: "generating" as const,
    jobs: [job("preview", "ready"), job("preview", "generating")],
  };
  const html = renderToStaticMarkup(<ProjectResultPending visible project={run} />);
  expect(html).toContain("is-working");
  expect(html).toContain("1/2 ready");
  expect(html).toContain("Making previews…");
  expect(html).not.toContain("production-waiting-dots");
  expect(html).toContain("Stick-figure director with a clapperboard");
  expect(html).toContain('class="manga-reaction"');
  expect(html).toContain("Stick-figure camera operator");
  expect(html).toContain("Finding the shot…");
  expect(
    renderToStaticMarkup(<ProjectResultPending visible={false} project={run} />),
  ).not.toContain("is-working");
});
it("distinguishes a running full build from a failed one", () => {
  const active = renderToStaticMarkup(
    <ProjectResultPending visible project={{ ...project, jobs: [job("full", "rendering")] }} />,
  );
  expect(active).toContain("Rendering your film…");
  const failed = renderToStaticMarkup(
    <ProjectResultPending
      visible
      project={{ ...project, phase: "failed", jobs: [job("full", "failed")] }}
    />,
  );
  expect(failed).toContain("Build needs attention");
  expect(failed).not.toContain("production-waiting-dots");
  expect(failed).not.toContain("is-working");
});
it("stays still until observed on screen and shows waiting dots for a pending decision", () => {
  const run = {
    ...project,
    phase: "generating" as const,
    jobs: [job("preview", "generating")],
  };
  expect(renderToStaticMarkup(<ProjectResultPending project={run} />)).not.toContain("is-working");
  const waiting = renderToStaticMarkup(
    <ProjectResultPending
      visible
      project={{ ...run, inputWaits: [{ checkpoint: "generate", jobId: run.jobs[0].id }] }}
    />,
  );
  expect(waiting).toContain("Waiting for your decision");
  expect(waiting).toContain('class="production-waiting-dots is-visible"');
  expect(waiting).not.toContain("is-working");
});

it("scales the whole production scene down to fit its frame and never above design size", () => {
  expect(productionSetScale(800, 400)).toBe(1);
  expect(productionSetScale(productionSetSize.width / 2, 400)).toBe(0.5);
  expect(productionSetScale(800, productionSetSize.height / 4)).toBe(0.25);
  expect(productionSetScale(0, 0)).toBe(1);
  const html = renderToStaticMarkup(
    <ProjectResultPending visible project={{ ...project, jobs: [job("preview", "generating")] }} />,
  );
  expect(html).toMatch(
    /<div class="project-production-slot"><div class="project-production-set" aria-hidden="true" style="transform:translate\(-50%, -50%\) scale\(1\)">/,
  );
  expect(html.match(/class="manga-crew /g)).toHaveLength(3);
});

const cssRule = (file: string, selector: string) => {
  const css = readFileSync(new URL(file, import.meta.url), "utf8");
  const start = css.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
};
it("keeps a pending preview card the same frame as its finished video", () => {
  const card = cssRule("../src/client/style.css", ".candidate-media > .project-result-pending");
  expect(card).toContain("width: 100%");
  expect(card).toContain("min-height: 0");
  expect(card).toContain("max-height: 420px");
  expect(cssRule("../src/client/style.css", ".candidate-media video")).toContain(
    "max-height: 420px",
  );
  expect(cssRule("../src/client/style.css", ".project-result-pending")).toContain("min-width: 0");
});
it("uses the room text colours for the pending heading on the dark room surface", () => {
  expect(
    cssRule("../src/client/room/room.css", ".creative-room .project-result-pending h3"),
  ).toContain("color: var(--room-text)");
  expect(
    cssRule("../src/client/room/room.css", ".creative-room .project-result-pending p"),
  ).toContain("color: var(--room-muted)");
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const value = parseInt(hex.slice(i, i + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };
  const lightestPendingSurface = "#2a231d";
  expect(contrast(roomColors.text, lightestPendingSurface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(roomColors.muted, lightestPendingSurface)).toBeGreaterThanOrEqual(4.5);
});
