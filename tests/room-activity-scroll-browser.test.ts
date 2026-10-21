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
  "follows appended activity and preserves the position when reading earlier logs",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "activity-scroll-"));
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
          name: "activity-scroll-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/activity-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `<!doctype html><style>.room-project-scroll{height:300px;overflow:auto}.room-activity-detail{padding:16px}.ant-bubble{min-height:65px}</style><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomActivity}from'/src/client/room/room-activity.tsx';
import'/src/client/room/room.css';
const run={id:'project',createdAt:'2026-01-01',phase:'preparing',request:{instructions:'Example'},candidates:[],jobs:[]};
const makeEvent=id=>({id,runId:'project',type:'agent_message',time:'2026-01-01T10:00:00Z',message:'Activity update '+id,data:{audience:'customer'}});
function App(){const[events,setEvents]=useState(Array.from({length:15},(_,i)=>makeEvent(i+1)));return React.createElement(React.Fragment,null,React.createElement('button',{id:'append',onClick:()=>setEvents(prev=>[...prev,makeEvent(prev.length+1)])},'Append'),React.createElement('button',{id:'build',onClick:()=>setEvents(prev=>[...prev,{...makeEvent(prev.length+1),type:'tool',message:'Bash',data:{purpose:'full video generation',invocationId:'build-attempt',itemId:'build-action',toolName:'Bash'}},{...makeEvent(prev.length+2),type:'tool_result',data:{purpose:'full video generation',invocationId:'build-attempt',results:[{itemId:'build-action',failed:true}]}},{...makeEvent(prev.length+3),type:'tool',message:'Bash',data:{purpose:'full video generation',invocationId:'build-attempt',itemId:'build-retry',toolName:'Bash'}},{...makeEvent(prev.length+4),type:'tool_result',data:{purpose:'full video generation',invocationId:'build-attempt',results:[{itemId:'build-retry',failed:false}]}}])},'Build'),React.createElement('div',{className:'room-project-scroll'},React.createElement(RoomActivity,{run,events})));}
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
      await page.goto(`${server.resolvedUrls!.local[0]}activity-test`);
      await page.waitForSelector(".ant-collapse-header");
      await page.click(".ant-collapse-header");
      const atBottom = () =>
        page.waitForFunction(() => {
          const el = document.querySelector(".room-project-scroll")!;
          return (
            el.scrollHeight > el.clientHeight &&
            el.scrollHeight - el.clientHeight - el.scrollTop < 5
          );
        });
      await atBottom();
      const before = await page.$eval(".room-project-scroll", (el) => el.scrollTop);
      await page.click("#append");
      await page.waitForFunction(() =>
        document.querySelector(".room-activity")?.textContent?.includes("Activity update 16"),
      );
      await atBottom();
      expect(await page.$eval(".room-project-scroll", (el) => el.scrollTop)).toBeGreaterThan(
        before,
      );
      await page.hover(".room-project-scroll");
      await page.mouse.wheel({ deltaY: -500 });
      await page.waitForFunction(() => {
        const el = document.querySelector(".room-project-scroll")!;
        return el.scrollHeight - el.clientHeight - el.scrollTop > 100;
      });
      const readingPosition = await page.$eval(".room-project-scroll", (el) => el.scrollTop);
      await page.click("#append");
      await page.waitForFunction(() =>
        document.querySelector(".room-activity")?.textContent?.includes("Activity update 17"),
      );
      await expect
        .poll(() => page.$eval(".room-project-scroll", (el) => el.scrollTop))
        .toBeCloseTo(readingPosition, 0);
      await page.hover(".room-project-scroll");
      await page.mouse.wheel({ deltaY: 10000 });
      await atBottom();
      await page.click("#append");
      await page.waitForFunction(() =>
        document.querySelector(".room-activity")?.textContent?.includes("Activity update 18"),
      );
      await atBottom();
      await page.click("#build");
      await page.waitForFunction(() =>
        document
          .querySelector(".room-activity-detail")
          ?.textContent?.includes("Building your full video…"),
      );
      await atBottom();
      expect(
        await page.$eval(
          ".room-activity-detail",
          (el) => el.textContent?.split("Building your full video…").length,
        ),
      ).toBe(2);
      const spacing = await page.$eval(".room-activity-detail", (element) => {
        const headers = [
          ...element.querySelectorAll<HTMLElement>(".ant-thought-chain-node-header"),
        ];
        const parent = headers.find((header) =>
          header.textContent?.includes("Creating your video…"),
        )!;
        const placeholder = parent.querySelector<HTMLElement>(
          ".ant-thought-chain-node-description",
        )!;
        const description = element.querySelector<HTMLElement>(
          ".ant-thought-chain-node-description:has(time)",
        )!;
        const child = parent.parentElement!.querySelector<HTMLElement>(".room-activity-steps")!;
        return {
          withoutTime: parseFloat(getComputedStyle(placeholder).marginBlockEnd),
          reservedHeight: placeholder.getBoundingClientRect().height,
          timeHeight: description.getBoundingClientRect().height,
          withTime: parseFloat(getComputedStyle(description).marginBlockEnd),
          actualGap:
            child.getBoundingClientRect().top -
            parent.querySelector(".ant-thought-chain-node-title")!.getBoundingClientRect().bottom,
        };
      });
      expect(spacing.withoutTime).toBeGreaterThan(0);
      expect(spacing.withoutTime).toBe(spacing.withTime);
      expect(spacing.reservedHeight).toBeCloseTo(spacing.timeHeight, 0);
      expect(spacing.actualGap).toBeCloseTo(spacing.timeHeight + spacing.withTime, 0);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60_000,
);
