import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases } from "../vite.resolve";

it.skipIf(!browserExecutablePath())(
  "edits website URLs in their section independently from the reply",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "onboarding-urls-"));
    const server = await createServer({
      configFile: false,
      cacheDir,
      root: appRoot,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.data/**"] } },
      plugins: [
        react(),
        {
          name: "onboarding-urls-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/onboarding-urls-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
import{emptyRoomDraft}from'/src/client/room/onboarding.ts';
function App(){const[draft,setDraft]=useState({...emptyRoomDraft(),step:3,stepLayout:'separate-speech',request:{instructions:'An example film',urls:[]}});return React.createElement(React.Fragment,null,React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:[],examples:[],onCreated(){},onUpload:async()=>[]}),React.createElement('output',{id:'state'},JSON.stringify(draft)));}
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
      await page.goto(`${server.resolvedUrls!.local[0]}onboarding-urls-test`);
      await page.waitForSelector(".room-website-items");
      const addUrl = () =>
        page.evaluate(() => {
          [...document.querySelectorAll("button")]
            .find((el) => el.textContent === "Add URL")!
            .click();
        });
      await addUrl();
      await page.type('[aria-label="Website URL 1"]', "https://example.com");
      await addUrl();
      await page.type('[aria-label="Website URL 2"]', "https://example.org");
      await page.type('[aria-label="Answer the assistant"] textarea', "Show the main journey.");
      const state = await page.$eval("#state", (el) => JSON.parse(el.textContent!));
      expect(state.request.urls).toEqual(["https://example.com", "https://example.org"]);
      expect(state.request.requirements.urls.instructions).toBe("Show the main journey.");
      expect(
        await page.$eval('[aria-label="Website URL 1"]', (el) =>
          Boolean(el.closest("section.room-materials")),
        ),
      ).toBe(true);
      for (let index = 0; index < 3; index++) await addUrl();
      expect(await page.$$('[type="url"]')).toHaveLength(5);
      expect(
        await page.$eval(
          ".room-website-items > button",
          (el) => (el as HTMLButtonElement).disabled,
        ),
      ).toBe(true);
      await page.click('[aria-label="Remove URL 2"]');
      expect(await page.$$('[type="url"]')).toHaveLength(4);
      expect(
        await page.$eval(
          ".room-website-items > button",
          (el) => (el as HTMLButtonElement).disabled,
        ),
      ).toBe(false);
      const removed = await page.$eval("#state", (el) => JSON.parse(el.textContent!));
      expect(removed.request.urls).toEqual(["https://example.com", "", "", ""]);
      await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find(
          (el) => el.textContent === "Continue",
        );
        button?.click();
      });
      await page.waitForFunction(
        () => JSON.parse(document.querySelector("#state")!.textContent!).step === 4,
      );
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60_000,
);
