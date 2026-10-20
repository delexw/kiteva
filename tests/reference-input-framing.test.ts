import { createServer } from "node:http";
import { expect, it, vi } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { createLocalReferenceBrowser } from "../src/server/jobs/subworkflows/website-reference";

it.skipIf(!browserExecutablePath()).each(["bottom edge", "nested container", "below fold"])(
  "does not automatically scroll or center an input at %s",
  async (placement) => {
    const field =
      '<label>Project title<input style="display:block;height:32px" oninput="measure()"></label>';
    const content =
      placement === "nested container"
        ? `<section style="margin-top:80px;height:400px;overflow:auto"><div style="height:320px"></div>${field}<div style="height:1500px"></div></section>`
        : `<div style="height:${placement === "below fold" ? "1100px" : "calc(90vh - 77px)"}"></div>${field}<div style="height:1500px"></div>`;
    const web = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><style>body{margin:0}h1{margin:0;height:40px;font-size:20px}</style><h1>Form example</h1>${content}<output></output><script>
        let scrollCount = 0;
        document.addEventListener('scroll', () => { scrollCount++; measure(); }, true);
        function measure() { const box = document.querySelector('input').getBoundingClientRect(); document.querySelector('output').textContent = 'POSITION|' + JSON.stringify({ top:box.top, bottom:box.bottom, viewport:innerHeight, value:document.querySelector('input').value, scrollCount, scrollY, nestedScroll:document.querySelector('section')?.scrollTop ?? 0 }) + '|'; }
        measure();
      </script>`);
    });
    await new Promise<void>((resolve) => web.listen(0, "127.0.0.1", resolve));
    const address = web.address();
    if (!address || typeof address === "string") throw Error("No fixture address");
    const url = `http://127.0.0.1:${address.port}`;
    const browser = await createLocalReferenceBrowser(
      [url],
      new AbortController().signal,
      "local",
      false,
    );
    const position = (text: string) =>
      JSON.parse(text.match(/POSITION\|(.+?)\|/)![1]) as {
        top: number;
        bottom: number;
        viewport: number;
        value: string;
        scrollCount: number;
        scrollY: number;
        nestedScroll: number;
      };
    try {
      let page = await browser.inspect(url);
      const before = position(page.text);
      const controlId = () => page.controls.find((control) => control.name === "Project title")!.id;
      if (placement === "below fold") {
        await expect(browser.fill(controlId(), "An idea")).rejects.toThrow(
          "use scroll_page explicitly",
        );
        expect(position((await browser.inspect()).text)).toMatchObject({
          scrollCount: 0,
          scrollY: 0,
          value: "",
        });
        await browser.scroll(600);
        // Wheel dispatch returns before the browser paints its native scrolling.
        await vi.waitFor(async () => {
          page = await browser.inspect();
          expect(position(page.text).scrollY).toBeGreaterThan(0);
        });
        expect(position((await browser.fill(controlId(), "An idea")).text).value).toBe("An idea");
      } else {
        const after = position((await browser.fill(controlId(), "An idea")).text);
        expect(after).toMatchObject({
          scrollCount: 0,
          scrollY: 0,
          nestedScroll: 0,
          value: "An idea",
        });
        expect(after.top).toBeCloseTo(before.top, 0);
        expect(after.bottom).toBeLessThan(after.viewport);
      }
    } finally {
      await browser.close();
      await new Promise<void>((resolve) => web.close(() => resolve()));
    }
  },
);
