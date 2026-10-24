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
const run={id:'project',createdAt:'2026-01-01',phase:'preparing',request:{instructions:'Example',selectedStyleIds:['style-018']},preparation:{fingerprint:'fixture',checkpoints:{inputs:{state:'completed',completedAt:'2026-01-01',output:{}},brief:{state:'completed',completedAt:'2026-01-01',output:{variant:'title-only'}},selection:{state:'running',startedAt:'2026-01-01'}}},candidates:[],jobs:[]};
const makeEvent=id=>({id,runId:'project',type:'agent_message',time:'2026-01-01T10:00:00Z',message:'Activity update '+id,data:{audience:'customer'}});
function App(){const[events,setEvents]=useState(Array.from({length:15},(_,i)=>makeEvent(i+1)));return React.createElement(React.Fragment,null,React.createElement('button',{id:'scoped',onClick:()=>setEvents([{id:1001,runId:'project',type:'activity_scope',message:'',time:'2026-01-01T10:00:00Z',data:{activityScope:{id:'root',label:'Preview planning',state:'running'}}},{id:1002,runId:'project',type:'activity_scope',message:'',time:'2026-01-01T10:00:01Z',data:{activityScope:{id:'child',parentId:'root',label:'A newly added activity',state:'running'}}},{id:1003,runId:'project',type:'activity_scope',message:'',time:'2026-01-01T10:00:02Z',data:{activityScope:{id:'grandchild',parentId:'child',label:'Nested work',state:'running'}}},{id:1004,runId:'project',type:'tool',message:'Read',time:'2026-01-01T10:00:03Z',data:{activityScopeId:'grandchild',itemId:'read',state:'item.completed'}}])},'Scoped tree'),React.createElement('button',{id:'repeat-log',onClick:()=>setEvents(prev=>[...prev,{id:1005,runId:'project',type:'tool',message:'Read',time:'2026-01-01T10:01:00Z',data:{activityScopeId:'grandchild',itemId:'new-read',state:'item.started'}},{id:1006,runId:'project',type:'tool_result',message:'',time:'2026-01-01T10:01:01Z',data:{activityScopeId:'grandchild',results:[{itemId:'new-read',failed:true,output:'failed'}]}}])},'Repeat log'),React.createElement('button',{id:'recover-log',onClick:()=>setEvents(prev=>[...prev,{id:1007,runId:'project',type:'tool',message:'Read',time:'2026-01-01T10:02:00Z',data:{activityScopeId:'grandchild',itemId:'recovered-read',state:'item.completed'}}])},'Recover log'),React.createElement('button',{id:'finish-scoped',onClick:()=>setEvents(prev=>[...prev,...['grandchild','child','root'].map((id,index)=>({id:1010+index,runId:'project',type:'activity_scope',message:'',time:'2026-01-01T10:00:04Z',data:{activityScope:{id,parentId:id==='grandchild'?'child':id==='child'?'root':undefined,label:id==='root'?'Preview planning':id==='child'?'A newly added activity':'Nested work',state:'complete'}}}))])},'Finish scoped'),React.createElement('button',{id:'planning',onClick:()=>setEvents(prev=>[{id:prev.length+1,runId:'project',type:'tool',time:'2026-01-01T10:00:00Z',message:'Read',data:{purpose:'Explicit-style preview planning',invocationId:'planning',itemId:'read',state:'item.completed'}},{id:prev.length+2,runId:'project',type:'tool',time:'2026-01-01T10:00:01Z',message:'mcp__reference_browser__inspect_page',data:{purpose:'Explicit-style preview planning',invocationId:'planning',itemId:'inspect',state:'item.started'}}])},'Planning'),React.createElement('button',{id:'append',onClick:()=>setEvents(prev=>[...prev,makeEvent(prev.length+1)])},'Append'),React.createElement('button',{id:'hf-render',onClick:()=>setEvents(prev=>[...prev,{...makeEvent(prev.length+1),type:'phase',message:'Rendering validated composition'},{...makeEvent(prev.length+2),type:'render_progress',message:'@hf-progress {"code":"capture","pct":67}'}])},'HyperFrames'),React.createElement('button',{id:'remotion-render',onClick:()=>setEvents(prev=>[...prev,{...makeEvent(prev.length+1),type:'phase',message:'Rendering validated composition'},{...makeEvent(prev.length+2),type:'render_progress',message:'Rendered 5/10'}])},'Remotion'),React.createElement('button',{id:'render',onClick:()=>setEvents(prev=>[...prev,{...makeEvent(prev.length+1),type:'validation',message:'Checking the Multiplane shot: stage size, duration and frame rate (2/2: shots/last.html)'},{...makeEvent(prev.length+2),type:'phase',message:'Rendering the Multiplane shot (2/2: shots/last.html)'},{...makeEvent(prev.length+3),type:'render_progress',message:'capture: 5/10 frames'}])},'Render'),React.createElement('button',{id:'finish-render',onClick:()=>setEvents(prev=>[...prev,{...makeEvent(prev.length+1),type:'render_progress',message:'finalize: 10/10 frames'}])},'Finish render'),React.createElement('button',{id:'build',onClick:()=>setEvents(prev=>[...prev,{...makeEvent(prev.length+1),type:'tool',message:'Bash',data:{purpose:'full video generation',invocationId:'build-attempt',itemId:'build-action',toolName:'Bash'}},{...makeEvent(prev.length+2),type:'tool_result',data:{purpose:'full video generation',invocationId:'build-attempt',results:[{itemId:'build-action',failed:true}]}},{...makeEvent(prev.length+3),type:'tool',message:'Bash',data:{purpose:'full video generation',invocationId:'build-attempt',itemId:'build-retry',toolName:'Bash'}},{...makeEvent(prev.length+4),type:'tool_result',data:{purpose:'full video generation',invocationId:'build-attempt',results:[{itemId:'build-retry',failed:false}]}}])},'Build'),React.createElement('div',{className:'room-project-scroll'},React.createElement(RoomActivity,{run,events})));}
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
      const checkpointGaps = await page.$$eval(
        ".room-activity-detail > .room-activity-steps:first-child > .ant-thought-chain-node",
        (nodes) =>
          nodes
            .slice(1)
            .map(
              (node, index) =>
                node.getBoundingClientRect().top - nodes[index].getBoundingClientRect().bottom,
            ),
      );
      expect(checkpointGaps).toHaveLength(2);
      for (const gap of checkpointGaps) expect(gap).toBeCloseTo(8, 0);

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
        const checkpointRows = [
          ...element.querySelectorAll<HTMLElement>(
            ":scope > .room-activity-steps:first-child > .ant-thought-chain-node",
          ),
        ];
        return {
          checkpointTimeHeights: checkpointRows.map(
            (row) =>
              row.querySelector(".ant-thought-chain-node-description")!.getBoundingClientRect()
                .height,
          ),
          checkpointVisibleTimes: checkpointRows.flatMap((row) => [...row.querySelectorAll("time")])
            .length,
          checkpointTitleGaps: checkpointRows
            .slice(1)
            .map(
              (row, index) =>
                row.querySelector(".ant-thought-chain-node-title")!.getBoundingClientRect().top -
                checkpointRows[index]
                  .querySelector(".ant-thought-chain-node-title")!
                  .getBoundingClientRect().bottom,
            ),
          hasPlaceholder: Boolean(placeholder),
          gap: parseFloat(getComputedStyle(element).getPropertyValue("--activity-row-gap")),
          groupGap: parseFloat(getComputedStyle(element).rowGap),
          chainGaps: [...element.querySelectorAll(".room-activity-steps")].map((chain) =>
            parseFloat(getComputedStyle(chain).rowGap),
          ),

          timeHeight: description.getBoundingClientRect().height,
          withTime: parseFloat(getComputedStyle(description).marginBlockEnd),
          actualGap:
            child.getBoundingClientRect().top -
            parent.querySelector(".ant-thought-chain-node-title")!.getBoundingClientRect().bottom,
        };
      });
      expect(spacing.gap).toBe(8);
      expect(spacing.groupGap).toBe(spacing.gap);
      expect(spacing.chainGaps.length).toBeGreaterThan(1);
      expect(spacing.chainGaps.every((gap) => gap === spacing.gap)).toBe(true);
      expect(spacing.hasPlaceholder).toBe(false);

      expect(spacing.checkpointTimeHeights).toHaveLength(3);
      expect(spacing.checkpointVisibleTimes).toBe(0);
      for (const height of spacing.checkpointTimeHeights)
        expect(height).toBeCloseTo(spacing.timeHeight, 0);
      for (const gap of spacing.checkpointTitleGaps)
        expect(gap).toBeCloseTo(spacing.timeHeight + spacing.gap, 0);

      expect(spacing.actualGap).toBeCloseTo(spacing.gap, 0);
      await page.$eval(".room-activity", (element) =>
        (element as HTMLElement).style.setProperty("--activity-row-gap", "14px"),
      );
      const updatedGaps = await page.$eval(".room-activity-detail", (element) => ({
        group: parseFloat(getComputedStyle(element).rowGap),
        chains: [...element.querySelectorAll(".room-activity-steps")].map((chain) =>
          parseFloat(getComputedStyle(chain).rowGap),
        ),
        children: [...element.querySelectorAll(".ant-thought-chain-node-content-box")].map(
          (content) => parseFloat(getComputedStyle(content).paddingBlockStart),
        ),
      }));
      expect(updatedGaps.group).toBe(14);
      expect(updatedGaps.chains.every((gap) => gap === 14)).toBe(true);
      expect(updatedGaps.children.every((gap) => gap === 14)).toBe(true);
      await page.click("#render");
      await page.waitForSelector('.ant-progress[aria-valuenow="75"]');
      expect(
        await page.$$('.room-activity-heading .ant-progress[aria-valuenow="75"]'),
      ).toHaveLength(1);
      const renderTitles = await page.$$eval(".ant-thought-chain-node-title", (nodes) =>
        nodes
          .map((node) => node.textContent)
          .filter((text) => text?.startsWith("Rendering your video…")),
      );
      expect(renderTitles).toEqual(["Rendering your video… · 75%"]);
      const inline = await page.$eval(
        ".ant-thought-chain-node-title .activity-work-title:has(.ant-progress)",
        (title) => {
          const text = title.firstElementChild!.getBoundingClientRect();
          const bar = title.querySelector(".ant-progress")!.getBoundingClientRect();
          const percentage = title
            .querySelector(".activity-progress-percent")!
            .getBoundingClientRect();
          return {
            textRight: text.right,
            textMiddle: (text.top + text.bottom) / 2,
            barLeft: bar.left,
            barMiddle: (bar.top + bar.bottom) / 2,
            percentageRight: percentage.right,
          };
        },
      );
      expect(inline.barLeft).toBeGreaterThan(inline.textRight);
      expect(Math.abs(inline.barMiddle - inline.textMiddle)).toBeLessThan(5);
      expect(inline.percentageRight).toBeGreaterThan(inline.barLeft);
      expect(await page.$$(".ant-thought-chain-node-content > div > .ant-progress")).toHaveLength(
        0,
      );
      expect(await page.$$(".ant-progress")).toHaveLength(2);
      expect(await page.$eval(".room-activity", (el) => el.textContent)).toContain(
        "Rendering your video… · 75%",
      );
      await page.click("#finish-render");
      await page.waitForSelector('.ant-progress[aria-valuenow="100"]');
      await page.waitForFunction(() => {
        const title = [...document.querySelectorAll(".ant-thought-chain-node-title")].find((node) =>
          node.textContent?.startsWith("Rendering your video…"),
        );
        const node = title?.closest(".ant-thought-chain-item");
        return (
          node?.className.includes("success") ||
          !!title?.closest(".ant-thought-chain-node")?.querySelector(".anticon-check-circle")
        );
      });
      expect(await page.$$(".ant-progress")).toHaveLength(2);
      await page.click("#hf-render");
      await page.waitForSelector('.ant-progress[aria-valuenow="67"]');
      expect(await page.$$(".ant-progress")).toHaveLength(2);
      await page.click("#remotion-render");
      await page.waitForSelector('.ant-progress[aria-valuenow="50"]');
      expect(await page.$$(".ant-progress")).toHaveLength(2);
      await page.click("#planning");
      await page.waitForFunction(() => {
        const title = [...document.querySelectorAll(".ant-thought-chain-node-title")].find(
          (node) => node.textContent === "Preview planning",
        );
        const parent = title?.closest(".ant-thought-chain-node");
        return parent
          ?.querySelector(".ant-thought-chain-node-content")
          ?.textContent?.includes("Exploring your website for preview planning…");
      });
      const nesting = await page.evaluate(() => {
        const title = [...document.querySelectorAll(".ant-thought-chain-node-title")].find(
          (node) => node.textContent === "Preview planning",
        )!;
        const parent = title.closest(".ant-thought-chain-node")!;
        const children = [...parent.querySelectorAll(".ant-thought-chain-node-title")].filter(
          (node) => node !== title,
        );
        parent.scrollIntoView({ block: "start" });
        return {
          parentX: title.getBoundingClientRect().left,
          children: children.map((child) => ({
            text: child.textContent,
            x: child.getBoundingClientRect().left,
          })),
        };
      });
      expect(nesting.children.map((child) => child.text)).toEqual([
        "Planning your requested previews…",
        "Exploring your website for preview planning…",
      ]);
      expect(nesting.children.every((child) => child.x > nesting.parentX)).toBe(true);
      await page.screenshot({ path: "/tmp/kiteva-preview-planning-parent.png" });
      await page.click("#scoped");
      await page.waitForFunction(() =>
        document.querySelector(".room-activity")?.textContent?.includes("Reading project content…"),
      );
      const titles = await page.$$eval(".ant-thought-chain-node-title", (nodes) =>
        nodes.map((node) => node.textContent),
      );
      expect(titles).not.toContain("A newly added activity");
      expect(titles).not.toContain("Nested work");
      expect(titles.filter((title) => title === "Reading project content…")).toHaveLength(1);
      await page.click("#repeat-log");
      await page.waitForFunction(() => {
        const titles = [...document.querySelectorAll(".ant-thought-chain-node-title")].filter(
          (node) => node.textContent === "Reading project content…",
        );
        return (
          titles.length === 1 &&
          !!titles[0].closest(".ant-thought-chain-node")?.querySelector(".anticon-close-circle")
        );
      });
      await page.click("#recover-log");
      await page.waitForFunction(() => {
        const titles = [...document.querySelectorAll(".ant-thought-chain-node-title")].filter(
          (node) => node.textContent === "Reading project content…",
        );
        return (
          titles.length === 1 &&
          !!titles[0].closest(".ant-thought-chain-node")?.querySelector(".anticon-check-circle")
        );
      });
      await page.click("#finish-scoped");
      expect(
        await page.$$eval(".ant-thought-chain-node-title", (nodes) =>
          nodes.some((node) => node.textContent === "Nested work"),
        ),
      ).toBe(false);
      await page.screenshot({ path: "/tmp/kiteva-event-name-activity-groups.png" });
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60_000,
);
