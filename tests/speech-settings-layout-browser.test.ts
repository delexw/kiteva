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

it.skipIf(!browserExecutablePath())(
  "aligns narration controls and stacks them in narrow settings panels",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "speech-layout-"));
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
          name: "speech-layout-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url?.startsWith("/api/")) {
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ languageTracksSupported: true, available: true }));
                return;
              }
              if (req.url != "/layout") return next();
              res.setHeader("content-type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<style>body{margin:0;padding:16px;box-sizing:border-box}#root{max-width:1100px}</style><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{LanguageTrackSettings}from'/src/client/components/language-track-settings.tsx';import{VideoRequestSchema}from'/src/shared/domains/video.ts';import{qwenBaseVoices}from'/src/shared/speech.ts';import'/src/client/framework.css';
const request=VideoRequestSchema.parse({instructions:'Explain an example',languageTracks:{narration:['zh','en'].map(language=>({language,speech:{mode:'narration',engine:'qwen3-tts-base',voice:qwenBaseVoices[0].id,language,speed:1,volume:1}})),subtitles:['zh','en'],defaultNarration:'zh',defaultSubtitle:'zh'}});
createRoot(document.getElementById('root')).render(React.createElement(LanguageTrackSettings,{request,onChange:()=>{}}));</script>`,
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
      await page.setViewport({ width: 1200, height: 900 });
      await page.goto(`${server.resolvedUrls!.local[0]}layout`);
      await page.waitForSelector(".speech-ready");
      const subtitleSpacing = await page.$eval(".language-track-subtitles", (el) => ({
        display: getComputedStyle(el).display,
        gap: parseFloat(getComputedStyle(el).gap),
        alignItems: getComputedStyle(el).alignItems,
      }));
      expect(subtitleSpacing).toEqual({ display: "flex", gap: 12, alignItems: "center" });
      for (const width of [1200, 420]) {
        await page.setViewport({ width, height: 900 });
        const layouts = await page.$$eval(".speech-settings", (sections) =>
          sections.map((section) => {
            const rect = (selector: string) =>
              section.querySelector(selector)!.getBoundingClientRect();
            const engine = section
                .querySelector('[aria-label="Speech engine"]')!
                .closest(".ant-select")!
                .getBoundingClientRect(),
              voice = rect(".speech-voice-control"),
              select = rect(".speech-voice-control .ant-select"),
              button = rect(".speech-voice-control button");
            const adjustments = section.querySelectorAll(".speech-adjustment");
            const volume = adjustments[0].getBoundingClientRect(),
              speed = adjustments[1].getBoundingClientRect();
            return {
              engineTop: engine.top,
              voiceTop: voice.top,
              volumeTop: volume.top,
              speedTop: speed.top,
              selectHeight: select.height,
              buttonHeight: button.height,
              right: section.getBoundingClientRect().right,
              headings: section.querySelectorAll(".settings-section-heading").length,
            };
          }),
        );
        expect(layouts).toHaveLength(2);
        for (const l of layouts) {
          expect(l.selectHeight).toBeCloseTo(l.buttonHeight, 0);
          expect(l.right).toBeLessThanOrEqual(width);
          expect(l.headings).toBe(0);
          if (width > 520) {
            expect(l.engineTop).toBeCloseTo(l.voiceTop, 0);
            expect(l.volumeTop).toBeCloseTo(l.speedTop, 0);
          } else {
            expect(l.voiceTop).toBeGreaterThan(l.engineTop);
            expect(l.speedTop).toBeGreaterThan(l.volumeTop);
          }
        }
        await page.screenshot({ path: `/tmp/kiteva-speech-layout-${width}.png`, fullPage: true });
      }
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  45000,
);
