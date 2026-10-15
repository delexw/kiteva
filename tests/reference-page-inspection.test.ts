import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { inspectReferenceDocument } from "../src/server/requests/reference-page-inspection";

it.skipIf(!browserExecutablePath())(
  "returns working capture selectors when several headings share one container",
  async () => {
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath(),
      headless: "shell",
      pipe: true,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(
        '<section id="directions"><h2>Choose a direction</h2><article id="first"><h3>First preview</h3></article><h3>More previews</h3></section><section id="finished"><h2>Finished result</h2><h3>Result summary</h3></section>',
      );
      const first = await page.evaluate(inspectReferenceDocument);
      const sharedHeadings = first.sections.filter((section) =>
        ["Finished result", "Result summary"].includes(section.heading || ""),
      );
      expect(sharedHeadings).toHaveLength(2);
      expect(sharedHeadings[0].selector).toBe(sharedHeadings[1].selector);
      for (const section of first.sections) {
        const target = await page.$(section.selector);
        expect(target, section.heading).not.toBeNull();
        const screenshot = await target!.screenshot({ type: "png" });
        expect(Buffer.from(screenshot).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      }
      const second = await page.evaluate(inspectReferenceDocument);
      expect(second.sections).toEqual(first.sections);
    } finally {
      await browser.close();
    }
  },
  20000,
);
