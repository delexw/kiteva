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
  "shares the narration/subtitles script and preserves voice choices",
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
              if (req.url?.startsWith("/api/speech/status")) {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ available: true, detail: "Local narration ready" }));
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
      await page.waitForSelector('[role="switch"]');
      expect(await page.$('[aria-label="Speech and vocals"]')).not.toBeNull();
      await page.click('[role="switch"]');
      await page.waitForSelector('[aria-label="Speech mode"]');
      await page.click('[aria-label="Speech mode"]');
      await page.waitForSelector('.ant-select-item-option[title="Narration · local voice"]', {
        visible: true,
      });
      await page.locator('.ant-select-item-option[title="Narration · local voice"]').click();
      await page.waitForSelector('[aria-label="Speech language"]');
      await page.locator('[aria-label="Speech language"]').click();
      await page.waitForSelector('.ant-select-item-option[title="English · UK"]', {
        visible: true,
      });
      await page.locator('.ant-select-item-option[title="English · UK"]').click();
      expect(await page.$$('[aria-label="Shared script"]')).toHaveLength(1);
      await page.type('[aria-label="Shared script"]', "Let your idea take flight.");
      await page.click('[role="switch"]');
      await page.waitForSelector('[aria-label="Speech and vocals"]');
      await page.click('[role="switch"]');
      await page.waitForSelector('[aria-label="Shared script"]');
      expect(
        await page.$eval('[aria-label="Shared script"]', (el) => (el as HTMLTextAreaElement).value),
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
      const layout = await page.evaluate(() => {
        const bounds = (selector: string) =>
          document.querySelector(selector)!.getBoundingClientRect().toJSON();
        return {
          mode: bounds('[aria-label="Speech mode"]'),
          engine: bounds('[aria-label="Speech engine"]'),
          language: bounds('[aria-label="Speech language"]'),
          voice: bounds('[aria-label="Narrator voice"]'),
          volume: bounds('[aria-label="Narration volume"]'),
          speed: bounds('[aria-label="Speaking speed"]'),
        };
      });
      expect(layout.mode.y).toBeCloseTo(layout.engine.y, 0);
      expect(layout.language.y).toBeCloseTo(layout.voice.y, 0);
      expect(layout.volume.y).toBeCloseTo(layout.speed.y, 0);
      expect(layout.engine.x).toBeGreaterThan(layout.mode.x);
      await page.locator('[aria-label="Speech and vocals"] h3').click();
      await (await page.$('[aria-label="Speech and vocals"]'))!.screenshot({
        path: "/private/tmp/kiteva-speech-layout-wide.png",
      });
      await page.focus('[role="slider"][aria-label="Narration volume"]');
      await page.keyboard.press("Home");
      for (let step = 0; step < 30; step++) await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        () =>
          document
            .querySelector('[role="slider"][aria-label="Narration volume"]')
            ?.getAttribute("aria-valuenow") === "150",
      );
      expect(await page.$('audio[aria-label="Narrator sample"]')).toBeNull();
      for (const button of await page.$$("button"))
        if (await button.evaluate((el) => el.textContent === "Listen")) await button.click();
      await page.waitForSelector('audio[aria-label="Narrator sample"]');
      expect(previewRequests.at(-1)?.volume).toBe(1.5);
      const settings = await page.$$("button");
      for (const button of settings)
        if (await button.evaluate((el) => el.textContent === "Settings")) await button.click();
      await page.waitForSelector('[aria-label="Model"]');
      expect(await page.$('[aria-label="Speech and vocals"]')).toBeNull();
      expect(await page.$('[aria-label="Shared script"]')).toBeNull();
      const back = await page.$$("button");
      for (const button of back)
        if (await button.evaluate((el) => el.textContent === "Back")) await button.click();
      await page.waitForSelector('[aria-label="Shared script"]');
      expect(
        await page.$eval('[aria-label="Shared script"]', (el) => (el as HTMLTextAreaElement).value),
      ).toBe("Let your idea take flight.");
      expect(
        await page.$eval('[role="slider"][aria-label="Narration volume"]', (el) =>
          el.getAttribute("aria-valuenow"),
        ),
      ).toBe("150");
      await page.locator('[aria-label="Speech engine"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Pocket TTS"]', { visible: true });
      await page.locator('.ant-select-item-option[title="Pocket TTS"]').click();
      await page.waitForFunction(() =>
        document.querySelector('[aria-label="Speech and vocals"]')?.textContent?.includes("Alba"),
      );
      await page.locator('[aria-label="Narrator voice"]').click();
      await page.waitForSelector('.ant-select-item-option-selected[title="Alba"]', {
        visible: true,
      });
      for (let position = 0; position < 12; position++) await page.keyboard.press("ArrowUp");
      await page.waitForSelector('.ant-select-item-option-active[title="Fantine"]', {
        visible: true,
      });
      await page.waitForFunction(() =>
        Array.from(
          document.querySelectorAll(
            ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-group",
          ),
        ).some((element) => element.textContent === "Female"),
      );
      expect(
        await page.$$eval(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-group",
          (elements) => elements.map((element) => element.textContent),
        ),
      ).toContain("Female");
      await page.keyboard.press("Enter");
      expect(
        await page.$eval('[aria-label="Speech and vocals"]', (el) => el.textContent),
      ).toContain("Fantine");
      await page.locator('[aria-label="Speech language"]').click();
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
      ).toContain("Fantine");

      expect(
        await page.$eval('[aria-label="Shared script"]', (el) => (el as HTMLTextAreaElement).value),
      ).toBe("Let your idea take flight.");
      expect(
        await page.$eval('[role="slider"][aria-label="Narration volume"]', (el) =>
          el.getAttribute("aria-valuenow"),
        ),
      ).toBe("150");
      await page.locator('[aria-label="Speech engine"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Kokoro"]', { visible: true });
      await page.locator('.ant-select-item-option[title="Kokoro"]').click();
      await page.waitForFunction(() =>
        document.querySelector('[aria-label="Speech and vocals"]')?.textContent?.includes("Heart"),
      );
      await page.setViewport({ width: 390, height: 844 });
      await page.waitForFunction(() => {
        const mode = document.querySelector('[aria-label="Speech mode"]')!.getBoundingClientRect();
        const engine = document
          .querySelector('[aria-label="Speech engine"]')!
          .getBoundingClientRect();
        return engine.y > mode.bottom;
      });
      expect(
        await page.$eval(
          '[aria-label="Speech and vocals"]',
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.locator('[aria-label="Speech and vocals"] h3').click();
      await (await page.$('[aria-label="Speech and vocals"]'))!.screenshot({
        path: "/private/tmp/kiteva-speech-layout-narrow.png",
      });
      await page.setViewport({ width: 900, height: 1100 });
      await page.locator('[aria-label="Speech language"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Follow video · English"]', {
        visible: true,
      });
      await page.locator('.ant-select-item-option[title="Follow video · English"]').click();
      await page.waitForFunction(
        () =>
          !Array.from(document.querySelectorAll('[role="status"]')).some((el) =>
            el.textContent?.includes("Preparing your language"),
          ),
      );
      await page.locator('[aria-label="Shared script"]').fill("Let your idea take flight.");
      const clickStep = async (label: string) => {
        await page.evaluate((name) => {
          const button = Array.from(document.querySelectorAll(".room-step-tabs button")).find(
            (el) => el.textContent === name,
          );
          (button as HTMLButtonElement).click();
        }, label);
      };
      await clickStep("Settings");
      await page.locator('[aria-label="Video language"]').click();
      await page.waitForSelector('.ant-select-item-option[title="简体中文"]', { visible: true });
      await page.locator('.ant-select-item-option[title="简体中文"]').click();
      await clickStep("Music");
      await clickStep("Settings");
      expect(
        await page.$eval(
          '[aria-label="Video language"]',
          (el) => el.closest(".ant-select")?.textContent,
        ),
      ).toContain("简体中文");
      expect(
        await page.$eval(
          "#draft-state",
          (el) => JSON.parse(el.textContent!).request.outputLanguage,
        ),
      ).toBe("zh");
      await clickStep("Narration / subtitles");
      await page.waitForFunction(
        () =>
          (document.querySelector('[aria-label="Shared script"]') as HTMLTextAreaElement)?.value ===
          "Let your idea take flight.",
      );
      expect(
        await page.$eval('[aria-label="Shared script"]', (el) => (el as HTMLTextAreaElement).value),
      ).toBe("Let your idea take flight.");
      expect(
        await page.$eval('[aria-label="Speech and vocals"]', (el) => el.textContent),
      ).toContain("Xiaobei");
      await page.locator('[aria-label="Speech engine"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Pocket TTS"]', { visible: true });
      await page.locator('.ant-select-item-option[title="Pocket TTS"]').click();
      await page.locator('[aria-label="Narrator voice"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Yunjian"]', { visible: true });
      const chineseLabels = await page.$$eval(".ant-select-item-option", (elements) =>
        elements.map((el) => el.getAttribute("title")),
      );
      expect(chineseLabels).toEqual(
        expect.arrayContaining([
          "Xiaobei",
          "Xiaoni",
          "Xiaoxiao",
          "Xiaoyi",
          "Yunjian",
          "Yunxi",
          "Yunxia",
          "Yunyang",
        ]),
      );
      expect(
        await page.$$eval(".ant-select-item-group", (elements) =>
          elements.map((el) => el.textContent),
        ),
      ).toEqual(["Female", "Male"]);
      await page.locator('.ant-select-item-option[title="Yunjian"]').click();
      for (const button of await page.$$("button"))
        if (await button.evaluate((el) => el.textContent === "Listen")) await button.click();
      await page.waitForSelector('audio[aria-label="Narrator sample"]');
      expect(previewRequests.at(-1)).toMatchObject({
        engine: "pocket-tts",
        voice: "pocket_zh_yunjian",
        language: "zh",
      });
      await page.screenshot({ path: "/private/tmp/kiteva-language-desktop.png", fullPage: true });
      await clickStep("Settings");
      await page.locator('[aria-label="Video language"]').click();
      await page.waitForSelector('.ant-select-item-option[title="English"]', { visible: true });
      await page.locator('.ant-select-item-option[title="English"]').click();
      await page.waitForFunction(() =>
        document
          .querySelector('[aria-label="Video language"]')
          ?.closest(".ant-select")
          ?.textContent?.includes("English"),
      );
      await clickStep("Narration / subtitles");
      await page.waitForFunction(
        () =>
          (document.querySelector('[aria-label="Shared script"]') as HTMLTextAreaElement)?.value ===
          "Let your idea take flight.",
      );
      expect(
        await page.$eval('[aria-label="Shared script"]', (el) => (el as HTMLTextAreaElement).value),
      ).toBe("Let your idea take flight.");
      await page.locator('[aria-label="Speech engine"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Qwen3-TTS · VoiceDesign 1.7B"]', {
        visible: true,
      });
      await page.locator('.ant-select-item-option[title="Qwen3-TTS · VoiceDesign 1.7B"]').click();
      await page.locator('[aria-label="Narrator voice"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Deep"]', { visible: true });
      await page.locator('.ant-select-item-option[title="Deep"]').click();
      await page.locator('[aria-label="Speech language"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Chinese"]', { visible: true });
      await page.locator('.ant-select-item-option[title="Chinese"]').click();
      for (const button of await page.$$("button"))
        if (await button.evaluate((el) => el.textContent === "Listen")) await button.click();
      await page.waitForFunction(
        () => document.querySelector('audio[aria-label="Narrator sample"]') !== null,
      );
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector("#draft-state")!.textContent!).request.speech
            .language === "zh",
      );
      expect(previewRequests.at(-1)).toMatchObject({
        engine: "qwen3-tts",
        voice: "qwen_deep_male",
        language: "zh",
      });
      await page.locator('[aria-label="Speech engine"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Qwen3-TTS · Base 1.7B"]', {
        visible: true,
      });
      await page.locator('.ant-select-item-option[title="Qwen3-TTS · Base 1.7B"]').click();
      await page.locator('[aria-label="Narrator voice"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Male narrator"]', {
        visible: true,
      });
      await page.locator('.ant-select-item-option[title="Male narrator"]').click();
      await page.locator('[aria-label="Speech language"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Chinese"]', { visible: true });
      await page.locator('.ant-select-item-option[title="Chinese"]').click();
      for (const button of await page.$$("button"))
        if (await button.evaluate((el) => el.textContent === "Listen")) await button.click();
      await expect
        .poll(() => previewRequests.at(-1))
        .toMatchObject({ engine: "qwen3-tts-base", voice: "qwen_base_male", language: "zh" });
      await page.locator('[aria-label="Speech language"]').click();
      await page.waitForSelector('.ant-select-item-option[title="English"]', { visible: true });
      await page.locator('.ant-select-item-option[title="English"]').click();
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector("#draft-state")!.textContent!).request.speech
            .language === "en",
      );
      expect(
        await page.$eval("#draft-state", (el) => JSON.parse(el.textContent!).request.speech.voice),
      ).toBe("qwen_base_male");
      await page.locator('[aria-label="Narrator voice"]').click();
      await page.waitForSelector('.ant-select-item-option[title="Original narrator"]', {
        visible: true,
      });
      await page.locator('.ant-select-item-option[title="Original narrator"]').click();
      for (const button of await page.$$("button"))
        if (await button.evaluate((el) => el.textContent === "Listen")) await button.click();
      await expect
        .poll(() => previewRequests.at(-1))
        .toMatchObject({
          engine: "qwen3-tts-base",
          voice: "qwen_base_original_female",
          language: "en",
        });
      expect(languageRequests).toEqual([]);
      const savedDraft = await page.$eval("#draft-state", (el) => JSON.parse(el.textContent!));
      expect(savedDraft.request).toMatchObject({
        candidateCount: 2,
        selectedStyleIds: ["style-056"],
        instructions: "A concept introduction",
        outputLanguage: "en",
      });
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
