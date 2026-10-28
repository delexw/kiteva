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
  "renders distinct setup activities in the video group",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "technology-activity-"));
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
          name: "technology-activity-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/technology-activity-test") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';
import React from 'react';import {createRoot} from 'react-dom/client';
import {AgentActivity} from '/src/client/agent-activity.tsx';
const tools=['mcp__creative_pool__inspect_technologies','Bash','mcp__creative_pool__prepare_technology','mcp__creative_pool__prepare_technology_stylesheet'];
const events=tools.map((toolName,index)=>({id:index+1,runId:'example',jobId:'build',type:'tool',message:toolName,time:'2026-01-01T10:00:00Z',data:{toolName,itemId:'tool-'+index,purpose:'full video generation',invocationId:'build',state:'item.completed',...(index===1?{activity:'dependencies'}:{})}}));
const codexEvents=events.map(event=>({...event,type:'mcp_tool_call',data:{...event.data,toolName:event.data.toolName.replace('mcp__creative_pool__','creative_pool: ')}}));
const planningEvents=['plan_ready','storyboard_ready','capture_plan_ready'].map((type,index)=>({id:20+index,runId:'example',jobId:'plan',type,message:['Plan ready','Storyboard ready','Capture plan ready'][index],time:'2026-01-01T10:00:00Z',data:{purpose:'Full video planning',videoBuildPlanning:true,audience:'internal'}}));
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement('section',{id:'claude'},React.createElement(AgentActivity,{events})),React.createElement('section',{id:'codex'},React.createElement(AgentActivity,{events:codexEvents})),React.createElement('section',{id:'planning'},React.createElement(AgentActivity,{events:planningEvents}))));
</script>`,
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
      const errors: string[] = [];
      page.on("pageerror", (error) =>
        errors.push(error instanceof Error ? error.message : String(error)),
      );
      await page.goto(`${server.resolvedUrls!.local[0]}technology-activity-test`);
      await page.waitForFunction(() =>
        document.body.textContent?.includes("Bundling stylesheets and assets…"),
      );
      const text = await page.$eval("body", (body) => body.textContent);
      for (const label of [
        "Creating your video…",
        "Checking tool availability…",
        "Installing project dependencies…",
        "Bundling browser dependencies…",
        "Bundling stylesheets and assets…",
      ])
        expect(text).toContain(label);
      expect(await page.$eval("#claude", (section) => section.textContent)).toBe(
        await page.$eval("#codex", (section) => section.textContent),
      );
      expect(text).not.toContain("Recording video details");
      const planning = await page.$eval("#planning", (section) => section.textContent);
      for (const label of ["Plan ready", "Storyboard ready", "Capture plan ready"])
        expect(planning).toContain(label);
      expect(await page.$$("#planning .activity-notice")).toHaveLength(3);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
