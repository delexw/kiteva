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
const fixture = `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ProjectActivityPanel}from'/src/client/room/project-activity-panel.tsx';
import{RequestSchema}from'/src/shared/contracts.ts';
window.calls=[];window.streams=[];window.retries=[];window.holdActivity=true;
window.EventSource=class extends EventTarget{constructor(url){super();this.url=url;this.closed=false;window.streams.push(this);}close(){this.closed=true;}};
const node=(id,text,hasChildren=false)=>({id,scope:'project:job:',jobId:'job',kind:'notice',text,time:'2026-01-01T00:00:00Z',status:'complete',hasChildren});
window.fetch=async(url,options)=>{window.calls.push(String(url));if(window.holdActivity)await new Promise(resolve=>window.releaseActivity=()=>{window.holdActivity=false;resolve();});const query=new URL(String(url),'http://localhost').searchParams;const parents=query.get('path');const items=parents==='10.11'?[node(12,'Checking playback…')]:parents==='10'?[node(11,'Rendering your video…',true)]:[node(10,'Creating your video…',true),{...node(20,'Something interrupted this step. You can retry it.'),retryable:true,status:'stopped'}];return new Response(JSON.stringify({items,lastEventId:501,retryItemId:20}),{headers:{'Content-Type':'application/json'}});};
const run={id:'project',createdAt:'2026-01-01',phase:'generating',request:RequestSchema.parse({instructions:'Explain an original topic'}),candidates:[{id:'direction',displayTitle:'Example',styleId:'example'}],jobs:[{id:'job',runId:'project',candidateId:'direction',kind:'full',phase:'failed',workspace:'/unused',model:'example',duration:20}]};
run.jobs.push({...run.jobs[0],id:'earlier-job',phase:'rendering'});
function App(){const[active,setActive]=useState(false);return React.createElement(React.Fragment,null,React.createElement('button',{id:'activity',onClick:()=>setActive(true)},'Activity'),React.createElement('button',{id:'conversation',onClick:()=>setActive(false)},'Conversation'),active&&React.createElement('div',{className:'room-project-scroll',style:{height:500,overflow:'auto'}},React.createElement(ProjectActivityPanel,{run,onRetry:id=>window.retries.push(id)})));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script>`;
it.skipIf(!browserExecutablePath())(
  "loads only visible activity pages, retries the right job and disposes streams on leaving",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "activity-page-"));
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
          name: "activity-page-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/activity-test") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(await server.transformIndexHtml(req.url, fixture));
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
      await page.goto(`${server.resolvedUrls!.local[0]}activity-test`);
      await page.waitForSelector("#activity");
      expect(await page.evaluate(() => Reflect.get(window, "calls").length)).toBe(0);
      await page.click("#activity");
      await page.waitForSelector(".room-activity-list .ant-collapse-header");
      expect(await page.evaluate(() => Reflect.get(window, "calls").length)).toBe(0);
      expect(await page.$(".room-activity-list .ant-collapse-item-disabled")).toBeNull();
      await page
        .locator(".room-activity-list > .ant-collapse-item:first-child > .ant-collapse-header")
        .click();
      await page.waitForSelector(".project-activity-panel .loading-status", { visible: true });
      expect(
        await page.$eval(".loading-status > span:last-child", (node) => node.textContent),
      ).toBe("Loading activity…");
      expect(await page.$(".loading-status .ant-spin")).not.toBeNull();
      await page.evaluate(() => Reflect.get(window, "releaseActivity")());
      await page.waitForSelector(".room-activity");
      await page.waitForSelector(".project-activity-panel .loading-status", { hidden: true });
      await page.waitForSelector('.activity-context-history[data-activity-branch="root"]');
      expect(await page.evaluate(() => Reflect.get(window, "calls"))).toEqual([
        "/api/runs/project/activity/children?jobId=job&offset=0",
      ]);
      expect(await page.$eval(".project-activity-panel", (node) => node.textContent)).not.toMatch(
        /Older activity|Newer activity|Latest activity/,
      );
      const nestedHeader =
        '.activity-context-history[data-activity-branch="root"] > div > .ant-collapse > .ant-collapse-item > .ant-collapse-header';
      await page.locator(nestedHeader).click();
      await page.waitForSelector('[data-activity-branch="10"]');
      await expect.poll(() => page.evaluate(() => Reflect.get(window, "calls").length)).toBe(2);
      expect(await page.evaluate(() => Reflect.get(window, "calls")[1])).toContain("path=10");
      await page
        .locator(
          '[data-activity-branch="10"] > div > .ant-collapse > .ant-collapse-item > .ant-collapse-header',
        )
        .click();
      await page.waitForSelector('[data-activity-branch="10.11"]');
      await expect.poll(() => page.evaluate(() => Reflect.get(window, "calls").length)).toBe(3);
      expect(await page.evaluate(() => Reflect.get(window, "calls")[2])).toContain("path=10.11");
      await page.waitForFunction(() =>
        document
          .querySelector('[data-activity-branch="10.11"]')
          ?.textContent.includes("Checking playback"),
      );
      const indents = await page.evaluate(() =>
        ["root", "10", "10.11"].map((path) => {
          const branch = document.querySelector(`[data-activity-branch="${path}"]`);
          const node = branch?.querySelector(".ant-thought-chain-node-title");
          if (!node) throw Error(`Missing activity row at ${path}`);
          return node.getBoundingClientRect().left;
        }),
      );
      expect(indents[1] - indents[0]).toBeCloseTo(28, 0);
      expect(indents[2] - indents[1]).toBeCloseTo(28, 0);

      await page.locator(nestedHeader).click();
      await page.waitForFunction(() => !document.querySelector('[data-activity-branch="10"]'));
      expect(await page.$('[data-activity-branch="10.11"]')).toBeNull();
      await page.locator(".room-activity-retry").click();
      await page.waitForFunction(() => Reflect.get(window, "retries").length > 0);
      expect(await page.evaluate(() => Reflect.get(window, "retries"))).toEqual(["job"]);
      const otherHeader =
        ".room-activity-list > .ant-collapse-item:nth-child(2) > .ant-collapse-header";
      await page.locator(otherHeader).click();
      await page.waitForFunction(() => Reflect.get(window, "streams").length === 1);
      expect(await page.evaluate(() => Reflect.get(window, "calls").at(-1))).toContain(
        "jobId=earlier-job",
      );
      await page.locator(otherHeader).click();
      await page.waitForFunction(() => Reflect.get(window, "streams")[0].closed);
      await page.click("#conversation");
      await page.waitForFunction(() => !document.querySelector(".activity-context-history"));
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
