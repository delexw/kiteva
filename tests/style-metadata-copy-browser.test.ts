import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";
import { loadCatalog } from "../src/server/catalog/catalog";
import { styleMetadataMarkdown } from "../src/shared/style-metadata";

it.skipIf(!browserExecutablePath())(
  "copies displayed style metadata and offers selectable text when clipboard access fails",
  async () => {
    const style = (await loadCatalog()).styles.find((item) => item.id === "style-007")!;
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "style-copy-"));
    const server = await createServer({
      configFile: false,
      root: appRoot,
      cacheDir,
      resolve: { alias: browserAliases },
      optimizeDeps: browserDependencyScan,
      server: { host: "127.0.0.1", port: 0, watch: null },
      plugins: [
        react(),
        {
          name: "style-copy-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/copy") return next();
              res.setHeader("content-type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{StyleDetailActions}from'/src/client/components/style-detail-actions.tsx';import{Dialog}from'/src/client/dialog.tsx';import'/src/client/style.css';import'/src/client/framework.css';
Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(window.rejectCopy)throw Error('denied');window.copiedMetadata=text;}}});
const style=${JSON.stringify(style).replaceAll("<", "\\u003c")};createRoot(document.getElementById('root')).render(React.createElement(Dialog,{title:style.name_en,onClose:()=>{},footer:React.createElement(StyleDetailActions,{style,onUse:()=>{}})},React.createElement('p',null,'Style metadata')));</script>`,
                ),
              );
            });
          },
        },
      ],
    });
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath()!,
      headless: true,
    });
    try {
      await server.listen();
      const page = await browser.newPage();
      await page.goto(`${server.resolvedUrls!.local[0]}copy`);
      await page.waitForSelector('[aria-label="Copy style metadata"]');
      for (const width of [1200, 390, 320]) {
        await page.setViewport({ width, height: 800 });
        const sizes = await page.$$eval(".style-detail-actions button", (buttons) =>
          buttons.map((button) => {
            const rect = button.getBoundingClientRect();
            return {
              height: rect.height,
              top: rect.top,
              right: rect.right,
              fontSize: getComputedStyle(button).fontSize,
            };
          }),
        );
        expect(sizes).toHaveLength(2);
        expect(sizes[0].height).toBeCloseTo(sizes[1].height, 0);
        expect(sizes[0].fontSize).toBe(sizes[1].fontSize);
        if (width === 1200) expect(sizes[0].top).toBeCloseTo(sizes[1].top, 0);
        for (const size of sizes) expect(size.right).toBeLessThanOrEqual(width);
      }
      await page.click('[aria-label="Copy style metadata"]');
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Copy style metadata"]')?.textContent === "Copied",
      );
      expect(
        await page.evaluate(() => (window as unknown as { copiedMetadata: string }).copiedMetadata),
      ).toBe(styleMetadataMarkdown(style));
      await page.evaluate(() => {
        (window as unknown as { rejectCopy: boolean }).rejectCopy = true;
      });
      await page.click('[aria-label="Copy style metadata"]');
      await page.waitForSelector('[aria-label="Style metadata to copy"]');
      expect(
        await page.$eval(
          '[aria-label="Style metadata to copy"]',
          (element) => (element as HTMLTextAreaElement).value,
        ),
      ).toBe(styleMetadataMarkdown(style));
      expect(
        await page.$eval('[aria-label="Copy style metadata"]', (element) => element.textContent),
      ).toBe("Copy");
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  45000,
);
