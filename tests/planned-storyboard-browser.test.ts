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
import { validStoryboard } from "./fixtures/storyboard";

it.skipIf(!browserExecutablePath())(
  "opens and plays the storyboard while the full film is still generating",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "planned-storyboard-browser-"));
    const storyboard = validStoryboard(30);
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
          name: "planned-storyboard-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url?.startsWith("/api/artifacts/example/full/STORYBOARD.json")) {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(storyboard));
                return;
              }
              if (
                req.url !== "/planned-storyboard-test" &&
                !req.url?.startsWith("/projects/example/storyboard")
              )
                return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomProject}from'/src/client/room/room-project.tsx';
import{StoryboardPage}from'/src/client/storyboard-page.tsx';
import{RequestSchema}from'/src/shared/contracts.ts';
function App(){const[ready,setReady]=useState(false);const[view,setView]=useState({tab:'storyboard'});const noop=()=>{};
const job={id:'full',runId:'example',candidateId:'direction',kind:'full',phase:'generating',duration:30,workspace:'/tmp/example',model:'example',storyboardReady:ready};
const run={id:'example',createdAt:'2026-01-01',phase:'generating',request:RequestSchema.parse({instructions:'Explain knowledge'}),jobs:[job],candidates:[]};
return React.createElement(React.Fragment,null,React.createElement('button',{id:'publish-plan',onClick:()=>setReady(true)},'Finish planning'),React.createElement(RoomProject,{run,events:[],view,onView:setView,renderPreview:noop,renderFull:noop,onQuestion:noop,onUpdated:noop,onEdit:noop,onCancel:noop,onRetry:noop,controls:null}));}
createRoot(document.getElementById('root')).render(React.createElement(location.pathname.startsWith('/projects/')?()=>React.createElement(StoryboardPage,{projectId:'example',jobId:'full',onBack:()=>{}}):App));</script>`,
                ),
              );
            });
          },
        },
      ],
    });
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
    try {
      await server.listen();
      browser = await puppeteer.launch({
        executablePath: browserExecutablePath(),
        headless: "shell",
        pipe: true,
      });
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`${server.resolvedUrls!.local[0]}planned-storyboard-test`);
      await page.waitForFunction(() =>
        document.body.textContent?.includes("before recording begins"),
      );
      expect(await page.$('a[href*="/storyboard?job="]')).toBeNull();
      await page.click("#publish-plan");
      await page.waitForSelector('a[href="/projects/example/storyboard?job=full"]');
      const href = await page.$eval('a[href*="/storyboard?job="]', (el) => el.getAttribute("href"));
      await page.goto(new URL(href!, server.resolvedUrls!.local[0]).href);
      await page.waitForSelector('[aria-label="Animated manga rehearsal"]');
      await page.waitForFunction(
        () =>
          Number((document.querySelector('[aria-label="Movie time"]') as HTMLInputElement)?.value) >
          0,
      );
      expect(
        await page.$eval('[aria-label="Animated manga rehearsal"]', (el) => el.textContent),
      ).toContain("A shape unfolds");
      expect(errors).toEqual([]);
    } finally {
      await browser?.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
