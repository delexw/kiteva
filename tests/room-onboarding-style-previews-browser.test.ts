import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { loadCatalog } from "../src/server/catalog/catalog";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

it.skipIf(!browserExecutablePath())(
  "keeps preview directions enabled with selected styles",
  async () => {
    const styles = (await loadCatalog()).styles.map(({ id, name_en }) => ({ id, name_en }));
    const instructions =
      "Act 1 uses Vintage Rubber Hose Animation (style-140), continuing Rubber Hose animation. Act 3 uses Manga Production Theatre (style-136) with manga scenery. No mosaic.";
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "onboarding-style-preview-"));
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
          name: "onboarding-style-preview-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/onboarding-style-preview-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
import{emptyRoomDraft}from'/src/client/room/onboarding.ts';
function App(){const[created,setCreated]=useState(null);const[draft,setDraft]=useState({...emptyRoomDraft(),step:6,stepLayout:'separate-speech',request:{instructions:${JSON.stringify(instructions)},duration:180,urls:[],selectedStyleIds:['style-056','style-098','style-093'],candidateCount:2}});return React.createElement(React.Fragment,null,React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:${JSON.stringify(styles)},examples:[],onCreated:setCreated,onUpload:async()=>[]}),React.createElement('output',{id:'state'},JSON.stringify(draft)),React.createElement('output',{id:'created'},JSON.stringify(created)));}
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
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (request.url().endsWith("/api/runs") && request.method() === "POST") {
          void request.respond({
            status: 202,
            contentType: "application/json",
            body: JSON.stringify({
              id: "test-run",
              request: JSON.parse(request.postData()!),
              phase: "queued",
              jobs: [],
              candidates: [],
            }),
          });
        } else void request.continue();
      });
      await page.goto(`${server.resolvedUrls!.local[0]}onboarding-style-preview-test`);
      await page.waitForSelector('[aria-label="Preview directions"]');
      expect(
        await page.$eval(
          '[aria-label="Preview directions"]',
          (el) => (el as HTMLInputElement).disabled,
        ),
      ).toBe(false);
      await page.click('[aria-label="Preview directions"]');
      await page.waitForSelector('[aria-label="Preview directions"][aria-expanded="true"]');
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector("#state")!.textContent!).request.candidateCount === 3,
      );
      expect(
        await page.$eval("#state", (el) => JSON.parse(el.textContent!).request.selectedStyleIds),
      ).toEqual(["style-056", "style-098", "style-093"]);
      await page.click('[aria-label="Preview directions"]');
      await page.waitForSelector('[aria-label="Preview directions"][aria-expanded="true"]');
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector("#state")!.textContent!).request.candidateCount === 0,
      );
      await page.evaluate(() => {
        const next = [...document.querySelectorAll(".room-onboarding-actions button")].find(
          (el) => el.textContent?.trim() === "Continue",
        );
        if (!next) throw Error("Continue button missing");
        (next as HTMLButtonElement).click();
      });
      await page.waitForFunction(
        () => JSON.parse(document.querySelector("#state")!.textContent!).step === 7,
      );
      await page.evaluate(() => {
        const submit = [...document.querySelectorAll("button")].find(
          (el) => el.textContent?.trim() === "Create my project",
        );
        if (!submit) throw Error("Project submit button missing");
        submit.click();
      });
      await page.waitForFunction(
        () => JSON.parse(document.querySelector("#created")!.textContent!)?.id === "test-run",
      );
      const submitted = await page.$eval("#created", (el) => JSON.parse(el.textContent!).request);
      expect(submitted.selectedStyleIds).toEqual(["style-056", "style-098", "style-093"]);
      expect(submitted.instructions).toBe(instructions);
      expect(submitted.candidateCount).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60_000,
);
