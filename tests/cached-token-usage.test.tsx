import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CachedTokenUsage } from "../src/client/governance/cached-token-usage";

it("shows reported cached input without inventing cached output", () => {
  const html = renderToStaticMarkup(<CachedTokenUsage input={1234} />);
  expect(html).toBe(`<td>${Number(1234).toLocaleString()}</td><td>Not reported</td>`);
});

it("distinguishes unavailable cached input from a reported zero", () => {
  expect(renderToStaticMarkup(<CachedTokenUsage input={null} />)).toBe(
    "<td>Not recorded</td><td>Not reported</td>",
  );
  expect(renderToStaticMarkup(<CachedTokenUsage input={0} />)).toBe(
    "<td>0</td><td>Not reported</td>",
  );
});
