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
  "edits one script for narration and on-screen text",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "onboarding-script-"));
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
          name: "onboarding-script-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/onboarding-script-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
import{emptyRoomDraft}from'/src/client/room/onboarding.ts';
function App(){const[draft,setDraft]=useState({...emptyRoomDraft(),step:5,stepLayout:'separate-speech',request:{instructions:'An example film',urls:[],lyrics:{mode:'provided',text:'Original words'},speech:{mode:'narration',source:'provided',text:'Original words'}}});return React.createElement(React.Fragment,null,React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:[],examples:[],onCreated(){},onUpload:async()=>[]}),React.createElement('output',{id:'state'},JSON.stringify(draft)));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
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
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`${server.resolvedUrls!.local[0]}onboarding-script-test`);
      await page.waitForSelector('[aria-label="Shared script"]');
      expect(await page.$$('[aria-label="Shared script"]')).toHaveLength(1);
      expect(await page.$('[aria-label="Narration script source"]')).toBeNull();
      expect(await page.$('[aria-label="Narration script"]')).toBeNull();
      await page.click('[aria-label="Shared script"]');
      await page.$eval('[aria-label="Shared script"]', (el) =>
        (el as HTMLTextAreaElement).select(),
      );
      await page.keyboard.press("Backspace");
      await page.type('[aria-label="Shared script"]', "One shared script.");
      const state = await page.$eval("#state", (el) => JSON.parse(el.textContent!));
      expect(state.request.lyrics).toEqual({ mode: "provided", text: "One shared script." });
      expect(state.request.speech).toMatchObject({ source: "lyrics", text: "One shared script." });
      await page.evaluate(() => {
        const label = [...document.querySelectorAll("label")].find((el) =>
          el.textContent?.includes("Show lyrics on screen"),
        );
        (label?.querySelector("button") as HTMLButtonElement)?.click();
      });
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector("#state")!.textContent!).request.lyrics.mode === "off",
      );
      const narrationOnly = await page.$eval("#state", (el) => JSON.parse(el.textContent!));
      expect(narrationOnly.request.speech).toMatchObject({
        source: "provided",
        text: "One shared script.",
      });
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60_000,
);
