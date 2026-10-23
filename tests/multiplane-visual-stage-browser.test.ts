import { expect, it } from "vitest";
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";

it.skipIf(!browserExecutablePath())(
  "produces identical browser pixels after forward, backward and fresh direct seeks",
  async () => {
    const server = await createServer({
      configFile: false,
      root: appRoot,
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "silent",
    });
    await server.listen();
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath(),
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 320, height: 220, deviceScaleFactor: 1 });
      const url = `${server.resolvedUrls!.local[0]}tests/fixtures/multiplane/visual-stage.html`;
      await page.goto(url);
      await page.waitForFunction("typeof window.seekVisualStage === 'function'");
      const seek = (time: number) =>
        page.evaluate(
          (time) =>
            (
              window as unknown as {
                seekVisualStage: (t: number) => { canvas: number; caption: number };
              }
            ).seekVisualStage(time),
          time,
        );
      expect(await seek(0)).toEqual({ canvas: 1, caption: 1 });
      expect(await seek(0)).toEqual({ canvas: 1, caption: 1 });
      await seek(0.5);
      const original = await page.screenshot();
      expect(await seek(2)).toEqual({ canvas: 3, caption: 2 });
      await seek(0.5);
      expect(Buffer.from(await page.screenshot()).equals(Buffer.from(original))).toBe(true);
      await page.goto(url);
      await page.waitForFunction("typeof window.seekVisualStage === 'function'");
      expect(await seek(0.5)).toEqual({ canvas: 1, caption: 1 });
      expect(Buffer.from(await page.screenshot()).equals(Buffer.from(original))).toBe(true);
    } finally {
      await browser.close();
      await server.close();
    }
  },
  60000,
);
