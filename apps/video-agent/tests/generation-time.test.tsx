import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerationTime } from "../src/client/components/generation-time";

it("includes export or page validation in one generation total", () => {
  for (const finishingTime of [{ renderMs: 12000 }, { validationMs: 12000 }]) {
    const html = renderToStaticMarkup(
      <GenerationTime
        job={{ generationMs: 121000, finishedAt: "2026-01-01T00:02:13Z", ...finishingTime }}
        now={0}
      />,
    );
    expect(html).toContain("Generation 133s");
    expect(html).not.toMatch(/validation|export|elapsed/);
  }
});
it("updates elapsed generation time while work is active and hides unknown timing", () => {
  expect(
    renderToStaticMarkup(
      <GenerationTime
        job={{ startedAt: "2026-01-01T00:00:00Z", generationMs: 1000 }}
        now={Date.parse("2026-01-01T00:00:20Z")}
      />,
    ),
  ).toContain("Generation 20s");
  expect(renderToStaticMarkup(<GenerationTime job={{}} now={0} />)).toBe("");
});
