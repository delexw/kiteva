import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RendererChoice } from "../src/client/room/renderer-choice";
import { multiplaneLimits, multiplaneSettingCoverage } from "../src/shared/video-renderers";

it("shows the trial's limits up front and keeps the full support list folded away", () => {
  const html = renderToStaticMarkup(<RendererChoice value="multiplane" onChange={() => {}} />);
  expect(html).toContain("Trying Multiplane 0.3.10");
  for (const limit of multiplaneLimits) expect(html).toContain(limit);
  expect(html).toContain("Supported settings and limits");
  expect(html).not.toContain(multiplaneSettingCoverage[0].detail);
  expect(html).not.toMatch(/#stage|--quality|Shot\.define/);
  const plain = renderToStaticMarkup(<RendererChoice value="hyperframes" onChange={() => {}} />);
  expect(plain).not.toContain("Supported settings and limits");
});

it("describes every setting in plain words without command-line terms", () => {
  for (const item of multiplaneSettingCoverage) {
    expect(`${item.setting} ${item.detail}`).not.toMatch(/--|#stage|Shot\.|inspect|<video>/);
    expect(Boolean(item.limit)).toBe(item.support !== "supported");
  }
});
