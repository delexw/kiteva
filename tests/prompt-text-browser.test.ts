import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  "shows prompt chips and hover/focus previews in the Assistant, project and editor",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "prompt-text-browser-"));
    const server = await createServer({
      configFile: false,
      cacheDir,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.data/**", "**/dist/**"] } },
      plugins: [
        react(),
        {
          name: "prompt-text-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (
                req.url?.startsWith("/api/examples/") &&
                req.url.split("?")[0].endsWith("/video")
              ) {
                res.setHeader("Content-Type", "video/webm");
                res.end(await readFile(path.join(appRoot, "assets/style-previews/style-136.webm")));
                return;
              }
              if (req.url?.startsWith("/api/examples/")) {
                res.setHeader("Content-Type", "image/svg+xml");
                res.end(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="orange"/></svg>',
                );
                return;
              }
              if (req.url !== "/prompt-text-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
import{RoomProject}from'/src/client/room/room-project.tsx';
import{emptyRoomDraft}from'/src/client/room/onboarding.ts';
import{StylePromptInput}from'/src/client/components/style-prompt-input.tsx';
import{StyleExamplesContext}from'/src/client/components/style-picker.tsx';
import{RequestSchema}from'/src/shared/contracts.ts';
const idea='Act 1: <style id="style-140">Vintage Rubber Hose Animation</style>. Act 3: <style id="style-136">Manga Production Theatre</style>.';
const styles=[{id:'style-140',name_en:'Vintage Rubber Hose Animation'},{id:'style-136',name_en:'Manga Production Theatre'}];
const run={id:'fixture',createdAt:'2026-01-01T00:00:00Z',phase:'ready',request:RequestSchema.parse({instructions:idea,duration:180,resolution:"1440p",frameRate:60,renderer:"multiplane",provider:"claude",candidateCount:0,selectedStyleIds:["style-140"]}),candidates:[],jobs:[]};
function App(){const[value,setValue]=useState(idea);const[draft,setDraft]=useState({...emptyRoomDraft(),step:1,request:run.request});const[view,setView]=useState({tab:'conversation'});return React.createElement(React.Fragment,null,
React.createElement('section',{id:'assistant'},React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles,examples:[],onCreated(){},onUpload:async()=>[]})),
React.createElement('section',{id:'project'},React.createElement(RoomProject,{run,styles,examples:[],events:[],renderPreview:()=>null,renderFull:()=>null,controls:null,onQuestion(){},onUpdated(){},onEdit(){},onCancel(){},onRetry(){},view,onView:setView})),
React.createElement('section',{id:'editor'},React.createElement(StylePromptInput,{value,onChange:setValue,styles})),
React.createElement('output',{id:'stored',hidden:true},value));}
createRoot(document.getElementById('root')).render(React.createElement(StyleExamplesContext,{value:styles.map(style=>({styleId:style.id,video:'fixture.webm',videoGeneratedAt:'fixture',status:'ready',catalogHash:'fixture',thumbnail:'fixture.png'}))},React.createElement(App)));</script>`,
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
      await page.setViewport({ width: 1400, height: 1800 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`${server.resolvedUrls!.local[0]}prompt-text-test`);
      await page.waitForSelector('#project [aria-label="Selected project settings"]');
      const settings = await page.$eval(
        '#project [aria-label="Selected project settings"]',
        (element) => element.textContent,
      );
      for (const value of [
        "Claude Opus 5.5",
        "180s",
        "2K · 1440p",
        "60 fps",
        "Multiplane",
        "Vintage Rubber Hose Animation",
      ])
        expect(settings).toContain(value);
      expect(await page.$$('#project [aria-label="Selected project settings"]')).toHaveLength(1);
      const settingsBeforeIdea = await page.$eval(
        "#project .room-project-conversation",
        (element) => element.firstElementChild!.textContent,
      );
      expect(settingsBeforeIdea).toContain("Settings");
      expect(settingsBeforeIdea).toContain("180s");

      for (const section of ["assistant", "project", "editor"]) {
        const selector = `#${section} .style-prompt-mention`;
        await page.waitForSelector(selector);
        expect(await page.$$eval(selector, (els) => els.length)).toBe(2);
        expect(await page.$eval(`#${section}`, (el) => el.textContent)).not.toContain("<style id=");
        await page.hover(selector);
        await page.waitForSelector(".style-mention-preview video", { visible: true });
        expect(
          await page.$eval(".style-mention-preview video", (el) => el.getAttribute("src")),
        ).toBe("/api/examples/style-140/video?v=fixture");
        await page.waitForFunction(() => {
          const video = document.querySelector<HTMLVideoElement>(".style-mention-preview video");
          return video && video.readyState >= 2 && !video.paused;
        });
        await page.mouse.move(0, 0);
        await page.waitForSelector(".style-mention-preview", { hidden: true });
      }
      await page.focus("#project .style-prompt-mention");
      await page.waitForSelector(".style-mention-preview video", { visible: true });
      expect(await page.$eval("#stored", (el) => el.textContent)).toContain(
        '<style id="style-140">Vintage Rubber Hose Animation</style>',
      );
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  90_000,
);
