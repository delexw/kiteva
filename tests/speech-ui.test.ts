import { browserDependencyScan } from "../vite.resolve";
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
  "uses global language profiles and preserves the shared script and voice choices",
  async () => {
    const languageRequests: string[] = [];
    const previewRequests: Record<string, unknown>[] = [];
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "speech-ui-"));
    const server = await createServer({
      configFile: false,
      cacheDir,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: { "@": path.join(appRoot, "src/client") } },
      // Generated project HTML must not reload this isolated UI fixture.
      server: { host: "127.0.0.1", port: 0, watch: null },
      plugins: [
        react(),
        {
          name: "speech-ui-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url === "/api/setup" || req.url?.startsWith("/api/speech/status")) {
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    languageTracksSupported: true,
                    available: true,
                    detail: "Local narration ready",
                  }),
                );
                return;
              }
              if (req.url === "/api/room/localize") {
                languageRequests.push(req.url);
                res.statusCode = 500;
                res.end("Language changes must not start model calls");
                return;
              }
              if (req.url === "/api/speech/sample") {
                let body = "";
                for await (const chunk of req) body += chunk;
                previewRequests.push(JSON.parse(body));
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
import '/src/client/framework.css';import '/src/client/style.css';import{roomTheme,roomCssVariables,roomColors}from'/src/client/theme.ts';
function App(){const[draft,setDraft]=useState({step:4,stepLayout:'separate-speech',request:{instructions:'A concept introduction',candidateCount:2,selectedStyleIds:['style-056'],outputLanguage:'en',subtitles:{mode:'off'}}});return React.createElement(ConfigProvider,{theme:roomTheme},React.createElement('div',{style:{...roomCssVariables,padding:16,background:roomColors.inset,color:roomColors.text}},React.createElement('output',{id:'draft-state',hidden:true},JSON.stringify(draft)),React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:[],examples:[],onCreated(){},onUpload:async()=>[]})));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
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
      await page.waitForSelector('textarea[aria-label="Answer the assistant"]');
      expect(await page.$('[aria-label="Speech and vocals"]')).toBeNull();
      await page.evaluate(() => {
        const button = Array.from(document.querySelectorAll(".room-step-tabs button")).find(
          (item) => item.textContent === "Narration / subtitles",
        );
        (button as HTMLButtonElement).click();
      });
      await page.waitForSelector('[aria-label="Add language"]');
      expect(await page.$('[aria-label="Multiple language tracks"]')).toBeNull();
      expect(await page.$('[aria-label="Default language"]')).toBeNull();
      await page.type('[aria-label="Shared script"]', "Let your idea take flight.");
      await page.click('[aria-label="Add language"]');
      await page.locator('.ant-select-item-option[title="English"]').click();
      await page.waitForSelector('section[aria-label="Narration voice en"]');
      expect(await page.$('[aria-label="Speech mode"]')).toBeNull();
      expect(await page.$('[aria-label="Speech language"]')).toBeNull();
      await page.click('[aria-label="Speech engine"]');
      await page.locator('.ant-select-item-option[title="Qwen3-TTS · Base 1.7B"]').click();
      await page.click('[aria-label="Narrator voice"]');
      await page.locator('.ant-select-item-option[title="Original narrator"]').click();
      await page.locator(".speech-voice-control button").click();
      await expect
        .poll(() => previewRequests.at(-1))
        .toMatchObject({
          engine: "qwen3-tts-base",
          voice: "qwen_base_original_female",
          language: "en",
        });
      await page.click('.language-track-subtitles [role="switch"]');
      const draft = await page.$eval("#draft-state", (el) => JSON.parse(el.textContent!));
      expect(draft.request.languageTracks.showSubtitles).toBe(false);
      expect(draft.request.languageTracks.subtitles).toEqual([]);
      expect(
        await page.$eval('[aria-label="Shared script"]', (el) => (el as HTMLTextAreaElement).value),
      ).toBe("Let your idea take flight.");
      expect(draft.request.languageTracks.narration[0].speech.voice).toBe(
        "qwen_base_original_female",
      );
      expect(languageRequests).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
