import { mkdtemp, rm, mkdir } from "node:fs/promises";
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
  "shows chapter progress inline in the shared Ant Design X activity group",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "capture-progress-browser-"));
    const server = await createServer({
      configFile: false,
      root: appRoot,
      cacheDir,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.data/**"] } },
      plugins: [
        react(),
        {
          name: "capture-chapter-progress",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/capture-progress-test") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ThoughtChain}from'@ant-design/x';
import{roomActivityStep}from'/src/client/room/room-activity.tsx';import{activityItems}from'/src/client/agent-activity-model.ts';import{displayActivityItems}from'/src/client/activity-display.ts';
const entry=(id,completed,index,chapterId,title,status)=>({id,runId:'example',jobId:'job',time:new Date(Date.UTC(2026,0,1,10,0,id)).toISOString(),type:'capture_progress',message:'Capturing footage…',data:{captureProgress:{completed,total:2,index,chapterId,title,status}}});
const initial=[entry(1,0,1,'create','Create a video','running'),entry(2,1,1,'create','Create a video','complete'),entry(3,1,2,'review','Review the result','running')];
const context={purpose:'Footage chapter capture',invocationId:'capture',captureChapter:{chapterId:'review',title:'Review the result',index:2,total:2}};
const tool=(id,type,itemId,failed)=>({id,runId:'example',jobId:'job',time:'2026-01-01T10:00:0'+id+'Z',type,message:type==='tool'?'mcp__reference_browser__click_control':'Result',data:type==='tool'?{...context,itemId,toolName:'mcp__reference_browser__click_control'}:{...context,results:[{itemId,failed,output:'Result'}]}});
initial.push(tool(4,'tool','first'),tool(5,'tool_result','first',true),tool(6,'tool','retry'),tool(7,'tool_result','retry',false));
const timing=(id,phase,status,actual)=>({id,runId:'example',jobId:'job',time:new Date(Date.UTC(2026,0,1,10,0,id)).toISOString(),type:'capture_timing',message:'Timing',data:{captureTiming:{chapterId:'review',title:'Review the result',index:2,total:2,phase,status,targetDurationSeconds:10,actualDurationSeconds:actual}}});
initial.push(timing(9,'review','running'));
function App(){const[events,setEvents]=useState(initial);return React.createElement('main',{style:{padding:32,maxWidth:900}},React.createElement(ThoughtChain,{items:displayActivityItems(activityItems(events)).map(item=>roomActivityStep(item)),line:'dashed'}),React.createElement('button',{id:'finish',onClick:()=>setEvents(p=>[...p,timing(10,'review','complete'),timing(11,'accepted','complete',9.9),entry(12,2,2,'review','Review the result','complete')])},'Complete next chapter'));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
                ),
              );
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
      await page.setViewport({ width: 1000, height: 550 });
      await page.goto(server.resolvedUrls!.local[0] + "capture-progress-test");
      await page.waitForFunction(() => document.body.innerText.includes("50%"));
      expect(await page.$$eval(".ant-progress", (nodes) => nodes.length)).toBe(1);
      expect(await page.$eval("main", (node) => node.textContent)).toContain("Create a video");
      expect(await page.$eval("main", (node) => node.textContent)).toContain("Review the result");
      expect(await page.$$eval(".ant-thought-chain-status-error", (nodes) => nodes.length)).toBe(0);
      expect(
        await page.$eval(
          "main",
          (node) => (node.textContent || "").split("Exploring your website reference…").length - 1,
        ),
      ).toBe(1);
      const operation = await page.$eval("main", (node) => {
        const title = Array.from(node.querySelectorAll(".ant-thought-chain-node-title")).find(
          (el) => el.textContent === "Exploring your website reference…",
        );
        const chapter = title
          ?.closest(".ant-thought-chain-node")
          ?.parentElement?.closest(".ant-thought-chain-node");
        return chapter?.textContent;
      });
      expect(operation).toContain("Review the result");
      const inline = await page.$eval(".activity-work-title", (node) => {
        const progress = node.querySelector(".ant-progress")!;
        return Math.abs(node.getBoundingClientRect().y - progress.getBoundingClientRect().y) < 20;
      });
      expect(inline).toBe(true);
      await mkdir("/tmp/kiteva-capture-chapter-progress", { recursive: true });
      await page.screenshot({ path: "/tmp/kiteva-capture-chapter-progress/half.png" });
      await page.click("#finish");
      await page.waitForFunction(() => document.body.innerText.includes("100%"));
      expect(await page.$eval("main", (node) => node.textContent)).toContain(
        "Capture accepted · 9.9s / 10s",
      );
      expect(await page.$$eval(".ant-thought-chain-status-error", (nodes) => nodes.length)).toBe(0);
      await page.waitForSelector(".ant-progress-status-success");
      await page.screenshot({ path: "/tmp/kiteva-capture-chapter-progress/complete.png" });
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
