import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Phase } from "../src/shared/contracts";
import { ProjectStatus } from "../src/client/components/project-status";
it.each([
  ["ready", "Ready", "ready"],
  ["failed", "Failed", "error"],
  ["cancelled", "Cancelled", "stopped"],
  ["interrupted", "Interrupted", "stopped"],
  ["queued", "Queued", "active"],
  ["preparing", "Preparing", "active"],
  ["ranking", "Exploring", "active"],
  ["generating", "Creating", "active"],
  ["validating", "Checking", "active"],
  ["rendering", "Rendering", "active"],
] as const)("shows a visible, accessible %s status badge", (phase: Phase, label, tone) => {
  const html = renderToStaticMarkup(<ProjectStatus phase={phase} />);
  expect(html).toContain(`aria-label="Project status: ${label}"`);
  expect(html).toContain(`data-tone="${tone}"`);
  expect(html).toContain('role="status"');
  expect(html).toContain("<svg");
  expect(/class="[^"]*\bspin\b/.test(html)).toBe(tone === "active");
});
