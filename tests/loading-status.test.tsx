import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadingStatus } from "../src/client/components/loading-status";

it.each(["Loading activity…", "Loading project…", "正在加载设置…"])(
  "shows and announces a reusable loading message: %s",
  (text) => {
    const html = renderToStaticMarkup(<LoadingStatus text={text} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(`aria-label="${text}"`);
    expect(html).toContain(`<span>${text}</span>`);
    expect(html).toContain("ant-spin");
    expect(html).toContain('aria-hidden="true"');
  },
);
it("renders custom labels as text rather than HTML", () => {
  const html = renderToStaticMarkup(<LoadingStatus text="Loading <example>…" />);
  expect(html).toContain("Loading &lt;example&gt;…");
  expect(html).not.toContain("<example>");
});
