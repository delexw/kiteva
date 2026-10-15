import { describe, expect, it } from "vitest";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
const renderToStaticMarkup = (element: ReactNode) =>
  renderMarkup(<MemoryRouter>{element}</MemoryRouter>);
import { RecommendedStack } from "../src/client/recommended-stack";
describe("recommended stack UI", () => {
  it("shows readable libraries, APIs and guidance without internal role labels or JSON", () => {
    const html = renderToStaticMarkup(
      <RecommendedStack
        libraries={[
          {
            name: "GSAP",
            package: "gsap",
            runtime: "browser",
            purpose: "Control a seekable timeline.",
            suggested_apis: ["fromTo", "seek"],
            optional: true,
            production_roles: ["motion_engine"],
            docs_url: "https://example.com/docs",
            integration_guidance: "Use a single clock.",
          },
        ]}
        implementation="Animate separate layers."
        selectionGuidance="Choose for the scene."
      />,
    );
    for (const text of [
      "GSAP",
      "Control a seekable timeline.",
      "fromTo",
      "seek",
      "Optional",
      "Documentation",
      "Use a single clock.",
      "Animate separate layers.",
      "Choose for the scene.",
    ])
      expect(html).toContain(text);
    expect(html).toContain('href="/technologies?tool=gsap"');
    expect(html).not.toContain("motion_engine");
    expect(html).not.toContain("suggested_libraries");
    expect(html).not.toContain("<pre");
  });
  it("handles empty libraries and rejects unsafe documentation links", () => {
    expect(renderToStaticMarkup(<RecommendedStack libraries={[]} />)).toContain(
      "No specific libraries suggested",
    );
    expect(
      renderToStaticMarkup(
        <RecommendedStack libraries={[{ name: "Example", docs_url: "javascript:alert(1)" }]} />,
      ),
    ).not.toContain("href=");
  });
});
