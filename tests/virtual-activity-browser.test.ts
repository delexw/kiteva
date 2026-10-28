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
  "virtualizes nested history while preserving retry, scrolling and live appends",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "virtual-activity-"));
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
          name: "virtual-activity-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/activity-test") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<!doctype html><style>.room-project-scroll{height:400px;overflow:auto;border:1px solid}.room-activity-steps{font-size:14px}</style><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomActivity}from'/src/client/room/room-activity.tsx';import'/src/client/room/room.css';
const run={id:'project',phase:'failed',createdAt:'2026-01-01',request:{instructions:'Example'},jobs:[{id:'build',kind:'full',phase:'failed'}],candidates:[]};
const item=i=>({id:i+1,jobId:'build',scope:'project:build',kind:'tool',text:'Recorded work '+i,time:new Date(Date.UTC(2026,0,1,0,0,i)).toISOString(),status:'complete',purpose:'full video generation',invocationId:'build',itemId:'item-'+i});
const initial=Array.from({length:6000},(_,i)=>item(i));initial.push({...item(6000),kind:'notice',text:'Something interrupted this step. You can retry it.',retryable:true,status:'stopped'});
function App(){const[items,setItems]=useState(initial);return React.createElement(React.Fragment,null,React.createElement('button',{id:'append',onClick:()=>setItems(prev=>[...prev,item(prev.length)])},'Append'),React.createElement('div',{className:'room-project-scroll'},React.createElement(RoomActivity,{run,events:[],contexts:[{key:'build',label:'Full film example',status:'abort',summary:'Stopped',items,checkpoints:[]}],onRetry:()=>{window.retryCount=(window.retryCount||0)+1}})))}
createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
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
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(server.resolvedUrls!.local[0] + "activity-test");
      await page.waitForSelector(".ant-collapse-header");
      expect(await page.$(".room-virtual-activity")).toBeNull();
      await page.locator(".ant-collapse-header").click();
      await page.waitForFunction(
        () =>
          Number(document.querySelector(".room-virtual-activity")?.getAttribute("data-row-count")) >
          6000,
      );
      await page.waitForSelector('button[aria-label="Retry"]', { visible: true });
      const mounted = await page.$$("[data-activity-row]");
      expect(mounted.length).toBeGreaterThan(0);
      expect(mounted.length).toBeLessThan(80);
      await page.locator('button[aria-label="Retry"]').click();
      expect(await page.evaluate(() => Reflect.get(window, "retryCount"))).toBe(1);
      await page.$eval(".room-project-scroll", (node) => {
        node.scrollTop = 0;
      });
      await page.waitForFunction(() =>
        document.querySelector(".room-virtual-activity")?.textContent?.includes("Recorded work 0"),
      );
      await page.click("#append");
      await page.waitForFunction(
        () =>
          Number(document.querySelector(".room-virtual-activity")?.getAttribute("data-row-count")) >
          6001,
      );
      expect(await page.$eval(".room-project-scroll", (node) => node.scrollTop)).toBeLessThan(100);
      expect((await page.$$("[data-activity-row]")).length).toBeLessThan(80);
      await page.$eval(".room-project-scroll", (node) => {
        node.scrollTop = node.scrollHeight;
      });
      await page.waitForFunction(() =>
        document
          .querySelector(".room-virtual-activity")
          ?.textContent?.includes("Recorded work 6001"),
      );
      await page.click("#append");
      await page.waitForFunction(() =>
        document
          .querySelector(".room-virtual-activity")
          ?.textContent?.includes("Recorded work 6002"),
      );
      expect((await page.$$("[data-activity-row]")).length).toBeLessThan(80);
      await page.hover(".room-project-scroll");
      await page.mouse.wheel({ deltaY: -1000000 });
      await page.waitForFunction(() => {
        const container = document.querySelector(".room-project-scroll")!;
        return container.scrollTop < 100;
      });
      await page.locator(".ant-collapse-header").click();
      await page.waitForSelector('.ant-collapse-header[aria-expanded="false"]');
      await page.locator(".ant-collapse-header").click();
      await page.waitForSelector(".room-virtual-activity [data-activity-row]", { visible: true });
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
