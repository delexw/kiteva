import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PromptText } from "../src/client/components/style-mention";
import { parseStyleMentions } from "../src/shared/style-mentions";

it("renders explicit style references as shared chips without changing source text or spacing", () => {
  const prompt =
    'Act 1\n<style id="style-140">Vintage Rubber Hose Animation</style> → Act 3 <style id="style-136">Manga Production Theatre</style>.';
  const original = prompt;
  const html = renderToStaticMarkup(<PromptText>{prompt}</PromptText>);
  expect(html).not.toContain("&lt;style");
  expect(html).toContain("@Vintage Rubber Hose Animation");
  expect(html).toContain("@Manga Production Theatre");
  expect(html).toContain("Act 1\n");
  expect(html.match(/class="style-prompt-mention"/g)).toHaveLength(2);
  expect(prompt).toBe(original);
  expect(parseStyleMentions(prompt).filter((part) => part.type === "style")).toHaveLength(2);
});

it("keeps ordinary names as prose and escapes malformed or hostile markup", () => {
  const html = renderToStaticMarkup(
    <PromptText>
      {"Mosaic is optional. <style>unknown</style><script>alert(1)</script>"}
    </PromptText>,
  );
  expect(html).toContain("Mosaic is optional.");
  expect(html).not.toContain('class="style-prompt-mention"');
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
});

it("renders decoded mention labels as text, not executable HTML", () => {
  const html = renderToStaticMarkup(
    <PromptText>
      {'<style id="style-001">A &amp; B &lt;img onerror="alert(1)"&gt;</style>'}
    </PromptText>,
  );
  expect(html).toContain("@A &amp; B &lt;img");
  expect(html).not.toContain("<img");
});

it("renders motion XML as the same mention chip with its motion variant", () => {
  const html = renderToStaticMarkup(
    <PromptText>{'Use <motion id="motion-036">Glitch Type Build</motion> here.'}</PromptText>,
  );
  expect(html).toContain('data-mention-variant="motion"');
  expect(html).toContain("Glitch Type Build");
  expect(html).not.toContain("&lt;motion");
});
