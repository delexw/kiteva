import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";
import { promptMarkdownComponents } from "../src/client/components/prompt-markdown-components";

it("shows shared color chips throughout formatted messages while preserving links and code blocks", () => {
  const markdown = [
    "# Palette #123456",
    "Prose #abcdef, **bold #abc**, *italic #def* and `#112233`.",
    "- List #1234",
    "> Quote #ff0000",
    "| Color |\n| --- |\n| #00ff00 |",
    "[Site #aabbcc](https://example.com/#abc)",
    "```css\n.example { color: #654321; }\n```",
  ].join("\n\n");
  const html = renderToStaticMarkup(
    <Streamdown mode="static" components={promptMarkdownComponents} linkSafety={{ enabled: false }}>
      {markdown}
    </Streamdown>,
  );
  expect(html.match(/class="prompt-color-swatch"/g)).toHaveLength(9);
  expect(html).toContain("<em");
  expect(html).toContain('href="https://example.com/#abc"');
  expect(html).not.toContain('node="[object Object]"');
  expect(html).not.toContain("background-color:#654321");
  expect(html).toContain("#654321");
});
