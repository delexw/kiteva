import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";

it.skipIf(!browserExecutablePath())(
  "gates voice settings on lyrics and preserves choices between steps",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "speech-ui-"));
    const server = await createServer({
      configFile: false,
      cacheDir,
      root: appRoot,
      resolve: { alias: { "@": path.join(appRoot, "src/client") } },
      server: { host: "127.0.0.1", port: 0 },
      plugins: [
        react(),
        {
          name: "speech-ui-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url?.startsWith("/api/speech/status")) {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ available: true, detail: "Local narration ready" }));
                return;
              }
              if (req.url === "/api/speech/sample") {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ url: "/sample.wav" }));
                return;
              }
              if (req.url !== "/speech-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `<div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider,theme}from'antd';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
function App(){const[draft,setDraft]=useState({step:4,request:{instructions:'A concept introduction',lyrics:{mode:'off'}}});return React.createElement(ConfigProvider,{theme:{algorithm:theme.darkAlgorithm}},React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:[],examples:[],onCreated(){},onUpload:async()=>[]}));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
              );
              res.setHeader("Content-Type", "text/html");
              res.end(html);
            });
          },
        },
      ],
    });
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath(),
      headless: "shell",
      pipe: true,
    });
    try {
      await server.listen();
      const page = await browser.newPage();
      await page.setViewport({ width: 900, height: 1100 });
      await page.goto(`${server.resolvedUrls!.local[0]}speech-test`);
      await page.waitForSelector('[role="switch"]');
      expect(await page.$('[aria-label="Speech and vocals"]')).toBeNull();
      await page.click('[role="switch"]');
      await page.waitForSelector('[aria-label="Speech mode"]');
      await page.click('[aria-label="Speech mode"]');
      await page.waitForSelector('.ant-select-item-option[title="Narration · local voice"]', {
        visible: true,
      });
      await page.locator('.ant-select-item-option[title="Narration · local voice"]').click();
      await page.waitForSelector('[aria-label="Speech language"]');
      await page.click('[aria-label="Speech language"]');
      await page.waitForSelector('.ant-select-item-option[title="English · UK"]', {
        visible: true,
      });
      await page.locator('.ant-select-item-option[title="English · UK"]').click();
      await page.click('[aria-label="Narration script source"]');
      await page.waitForSelector('.ant-select-item-option[title="Use my narration script"]', {
        visible: true,
      });
      await page.locator('.ant-select-item-option[title="Use my narration script"]').click();
      await page.type('[aria-label="Narration script"]', "Let your idea take flight.");
      await page.click('[role="switch"]');
      await page.waitForFunction(() => !document.querySelector('[aria-label="Speech and vocals"]'));
      await page.click('[role="switch"]');
      await page.waitForSelector('[aria-label="Narration script"]');
      expect(
        await page.$eval(
          '[aria-label="Narration script"]',
          (el) => (el as HTMLTextAreaElement).value,
        ),
      ).toBe("Let your idea take flight.");
      expect(
        await page.$eval('[aria-label="Speech and vocals"]', (el) => el.textContent),
      ).toContain("Emma");
      await page.click('[aria-label="Speech mode"]');
      expect(
        await page.$eval(
          '.ant-select-item-option[title="Generated singing · not available"]',
          (el) => el.className,
        ),
      ).toContain("disabled");
      await page.keyboard.press("Escape");
      const listen = await page.$$("button");
      for (const button of listen)
        if (await button.evaluate((el) => el.textContent === "Listen")) await button.click();
      await page.waitForSelector('audio[aria-label="Narrator sample"]');
      const settings = await page.$$("button");
      for (const button of settings)
        if (await button.evaluate((el) => el.textContent === "Settings")) await button.click();
      await page.waitForSelector('[aria-label="Model"]');
      expect(await page.$('[aria-label="Speech and vocals"]')).toBeNull();
      expect(await page.$('[aria-label="Narration script"]')).toBeNull();
      const back = await page.$$("button");
      for (const button of back)
        if (await button.evaluate((el) => el.textContent === "Back")) await button.click();
      await page.waitForSelector('[aria-label="Narration script"]');
      expect(
        await page.$eval(
          '[aria-label="Narration script"]',
          (el) => (el as HTMLTextAreaElement).value,
        ),
      ).toBe("Let your idea take flight.");
      await page.click('[aria-label="Speech engine"]');
      await page.waitForSelector('.ant-select-item-option[title="Pocket TTS"]', { visible: true });
      await page.locator('.ant-select-item-option[title="Pocket TTS"]').click();
      await page.waitForFunction(() =>
        document.querySelector('[aria-label="Speech and vocals"]')?.textContent?.includes("Alba"),
      );
      await page.click('[aria-label="Speech language"]');
      await page.waitForSelector('.ant-select-item-option[title="Italian"]', { visible: true });
      const languageLabels = await page.$$eval(
        ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option",
        (elements) => elements.map((element) => element.textContent),
      );
      expect(languageLabels).toEqual(
        expect.arrayContaining([
          "English",
          "French",
          "German",
          "Portuguese",
          "Italian",
          "Spanish",
          "Dutch",
        ]),
      );
      await page.locator('.ant-select-item-option[title="Italian"]').click();
      await page.waitForFunction(() =>
        document
          .querySelector('[aria-label="Speech and vocals"]')
          ?.textContent?.includes("Italian"),
      );
      expect(
        await page.$eval('[aria-label="Speech and vocals"]', (el) => el.textContent),
      ).toContain("Alba");

      expect(
        await page.$eval(
          '[aria-label="Narration script"]',
          (el) => (el as HTMLTextAreaElement).value,
        ),
      ).toBe("Let your idea take flight.");
      await page.click('[aria-label="Speech engine"]');
      await page.waitForSelector('.ant-select-item-option[title="Kokoro"]', { visible: true });
      await page.locator('.ant-select-item-option[title="Kokoro"]').click();
      await page.waitForFunction(() =>
        document.querySelector('[aria-label="Speech and vocals"]')?.textContent?.includes("Heart"),
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
