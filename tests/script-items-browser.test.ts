import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

it.skipIf(!browserExecutablePath())(
  "edits independent timed script items, reorders them and restores the saved list",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "script-items-browser-"));
    const server = await createServer({
      configFile: false,
      cacheDir,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.data/**"] } },
      plugins: [
        react(),
        {
          name: "script-items-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url?.startsWith("/api/speech/status")) {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ available: true, detail: "Ready" }));
                return;
              }
              if (req.url !== "/script-items-test") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ScriptItems}from'/src/client/components/script-items.tsx';
const initial=[{id:'opening',startSeconds:0,endSeconds:2,text:'Read without narration',showSubtitles:true,speech:{mode:'off'}},{id:'voice',startSeconds:2,endSeconds:4,text:'Hello team',showSubtitles:false,speech:{mode:'narration',engine:'pocket-tts',language:'en',voice:'pocket_eve',speed:1,volume:0.8}}];
function App(){const[items,setItems]=useState(initial);const[saved,setSaved]=useState(initial);return React.createElement(React.Fragment,null,React.createElement(ScriptItems,{items,duration:20,onChange:setItems}),React.createElement('button',{id:'save',onClick:()=>setSaved(items)},'Save'),React.createElement('button',{id:'restore',onClick:()=>setItems(saved)},'Restore'),React.createElement('output',{id:'state',style:{display:'none'}},JSON.stringify(items)));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
                ),
              );
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
      await page.setViewport({ width: 1200, height: 1100 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`${server.resolvedUrls!.local[0]}script-items-test`);
      await page.waitForSelector('[aria-label="Item text"]');
      const state = async () =>
        JSON.parse(await page.$eval("#state", (el) => el.textContent || "[]"));
      expect((await state())[0].speech.mode).toBe("off");
      expect((await state())[1].speech.voice).toBe("pocket_eve");
      expect(await page.$$('[aria-label="Narration starts at (seconds)"]')).toHaveLength(0);
      await page.click(".script-item .ant-select");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      expect((await state())[0].source).toBe("write");
      expect(await page.$eval(".script-item", (el) => el.textContent)).toContain(
        "Script instructions",
      );
      await page.click(".script-item .ant-select");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter");
      expect((await state())[0].source).toBe("provided");
      const firstText = (await page.$$('[aria-label="Item text"]'))[0];
      await firstText.evaluate((el) => (el as HTMLTextAreaElement).select());
      await page.keyboard.press("Backspace");
      await firstText.type("Opening words");
      expect((await state())[0].text).toBe("Opening words");
      await page.click('[aria-label="Show subtitles on screen"]');
      expect((await state())[0].showSubtitles).toBe(false);
      expect((await state())[1].showSubtitles).toBe(false);
      const end = (await page.$$('[aria-label="End (seconds)"]'))[0];
      await end.click();
      await end.evaluate((el) => (el as HTMLInputElement).select());
      await page.keyboard.press("Backspace");
      await end.type("1.5");
      await end.press("Tab");
      expect((await state())[0].endSeconds).toBe(1.5);
      await page.click('[aria-label="Move item down"]');
      expect((await state())[0].id).toBe("voice");
      expect((await state())[1].id).toBe("opening");
      await page.click("#save");
      const add = await page.waitForSelector("::-p-text(Add script item)");
      await add!.click();
      expect(await state()).toHaveLength(3);
      await page.click("#restore");
      expect(await state()).toHaveLength(2);
      expect((await state())[1].endSeconds).toBe(1.5);
      await page.waitForFunction(
        () =>
          Number(
            (document.querySelectorAll('[aria-label="End (seconds)"]')[1] as HTMLInputElement)
              .value,
          ) === 1.5,
      );
      expect(
        await page.$$eval('[aria-label="End (seconds)"]', (elements) =>
          elements.map((el) => Number((el as HTMLInputElement).value)),
        ),
      ).toEqual([4, 1.5]);
      expect((await state())[0].speech).toMatchObject({
        engine: "pocket-tts",
        voice: "pocket_eve",
        language: "en",
        volume: 0.8,
      });
      await page.screenshot({ path: "/tmp/kiteva-script-items-ui.png", fullPage: true });
      await page.setViewport({ width: 390, height: 1100 });
      expect(
        await page.$eval(".script-item", (element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      const layout = await page.$eval(".script-item", (element) => {
        const text = element.querySelector(".script-item-text")!.getBoundingClientRect();
        const timing = element.querySelector(".script-item-timing")!.getBoundingClientRect();
        const actions = element.querySelector(".ant-card-extra")!.getBoundingClientRect();
        return {
          textBelowTiming: text.top > timing.bottom,
          actionsAboveTiming: actions.bottom < timing.top,
        };
      });
      expect(layout).toEqual({ textBelowTiming: true, actionsAboveTiming: true });
      await page.screenshot({ path: "/tmp/kiteva-script-items-mobile.png", fullPage: true });
      const remove = await page.waitForSelector("::-p-text(Remove item)");
      await remove!.click();
      expect(await state()).toHaveLength(1);
      expect((await state())[0].id).toBe("opening");
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
