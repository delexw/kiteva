import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { captureInputBounds } from "../src/server/requests/reference-control-framing";

it.skipIf(!browserExecutablePath()).each(["label", "aria-labelledby"])(
  "measures the full field and its %s for zoom framing",
  async (association) => {
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath(),
      headless: "shell",
    });
    try {
      const page = await browser.newPage();
      await page.setContent(
        `<style>body{margin:0}label,span{position:absolute;left:20px;top:20px;width:300px;height:30px}textarea{position:absolute;left:20px;top:60px;width:300px;height:180px;box-sizing:border-box}</style>${association === "label" ? '<label for="field">What should be explained?</label><textarea id="field"></textarea>' : '<span id="name">What should be explained?</span><textarea aria-labelledby="name"></textarea>'}`,
      );
      const field = await page.$("textarea");
      expect(await field!.evaluate(captureInputBounds)).toEqual({
        x: 20,
        y: 20,
        width: 300,
        height: 220,
      });
    } finally {
      await browser.close();
    }
  },
);
