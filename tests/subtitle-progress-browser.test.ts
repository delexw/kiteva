import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

it.skipIf(!browserExecutablePath())(
  "updates the subtitle cue count and progress bar in one activity row",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "subtitle-cues-"));
    const server = await createServer({
      configFile: false,
      root: appRoot,
      cacheDir,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: null },
      plugins: [
        react(),
        {
          name: "subtitle-cues-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/subtitle-cues-test") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ActivityRow}from'/src/client/agent-activity.tsx';import{activityItems}from'/src/client/agent-activity-model.ts';import{displayActivityItems}from'/src/client/activity-display.ts';import'/src/client/style.css';
const event=(completed,id)=>({id,runId:'example',jobId:'job',type:'subtitle_progress',message:'Subtitle progress',time:'2026-01-01T00:00:00Z',data:{subtitleProgress:{language:'en',completed,total:30,status:'running'}}});
function App(){const[events,setEvents]=useState([event(0,1),event(18,2)]);return React.createElement(React.Fragment,null,displayActivityItems(activityItems(events)).map(item=>React.createElement(ActivityRow,{item,key:item.id})),React.createElement('button',{id:'next',onClick:()=>setEvents(p=>[...p,event(19,3)])},'Next cue'));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
                ),
              );
            });
          },
        },
      ],
    });
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath(),
      headless: true,
      pipe: true,
    });
    try {
      await server.listen();
      const page = await browser.newPage();
      await page.goto(server.resolvedUrls!.local[0] + "subtitle-cues-test");
      await page.waitForSelector('[role="progressbar"][aria-valuenow="60"]');
      expect(await page.$eval(".activity-work-title", (node) => node.textContent)).toContain(
        "Generating English subtitles… 18/30 cues",
      );
      await page.click("#next");
      await page.waitForSelector('[role="progressbar"][aria-valuenow="63"]');
      expect(await page.$eval(".activity-work-title", (node) => node.textContent)).toContain(
        "19/30 cues",
      );
      expect(await page.$$(".activity-item")).toHaveLength(1);
      await page.screenshot({ path: "/tmp/kiteva-subtitle-cues-progress.png" });
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
