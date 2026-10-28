import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

it.skipIf(!browserExecutablePath())(
  "reviews requests, keeps unsaved choices across refreshes, and confirms version deletion",
  async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "refinement-review-"));
    const run: Run = {
      id: "example-project",
      createdAt: "2026-01-01",
      phase: "ready",
      request: RequestSchema.parse({ instructions: "Explain a concept" }),
      candidates: [],
      jobs: [1, 2, 3].map((n) => ({
        id: `v${n}`,
        runId: "example-project",
        candidateId: "direction",
        kind: "full",
        phase: n === 2 ? "cancelled" : "ready",
        sessionId: "builder",
        model: "example",
        duration: 20,
        workspace: "/unused",
        video: "film.mp4",
        ...(n > 1 ? { refinementPrompt: `Request ${n}` } : {}),
      })),
    };
    const submissions: Record<string, unknown>[] = [];
    const server = await createServer({
      configFile: false,
      root: appRoot,
      cacheDir: path.join(folder, "cache"),
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: null },
      plugins: [
        react(),
        {
          name: "review-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              res.setHeader("Content-Type", "application/json");
              if (req.url?.endsWith("/refine")) {
                let body = "";
                for await (const chunk of req) body += chunk;
                submissions.push(JSON.parse(body));
                res.end("{}");
                return;
              }
              if (req.url === "/api/runs/example-project") {
                res.end(JSON.stringify(run));
                return;
              }
              if (req.url?.startsWith("/api/")) {
                res.end("[]");
                return;
              }
              if (!req.url?.startsWith("/review-test")) return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<div id="root"></div><script type="module">
import '/src/client/style.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{VideoRefinement}from'/src/client/components/video-refinement.tsx';
import{RoomProject}from'/src/client/room/room-project.tsx';
import{RevisionStack}from'/src/client/components/revision-stack.tsx';
import{fullRevisionGroups}from'/src/client/lib/revision-stack.ts';
import{preserveJobVersions,reserveJobVersion}from'/src/shared/job-versions.ts';
const h=React.createElement;
function App(){const[run,setRun]=useState(${JSON.stringify(run)});const[selected,setSelected]=useState();const[view,setView]=useState({tab:'full',refine:''});return h('main',null,
 h('button',{id:'refresh',onClick:()=>setRun(structuredClone(run))},'Refresh'),
 h('button',{id:'add',onClick:()=>{const next=structuredClone(run);next.jobs.push({...next.jobs[0],id:'next',version:reserveJobVersion(next,'direction')});setRun(next)}},'Add'),
 h(${req.url.includes("?room") ? "RoomProject" : "VideoRefinement"},{run,onUpdated:setRun,view,onView:setView,events:[],renderFull:()=>null,renderPreview:()=>null,controls:null,onQuestion:()=>{},onEdit:()=>{},onCancel:()=>{},onRetry:()=>{}}),
 ...fullRevisionGroups(run.jobs).map(group=>h(RevisionStack,{key:group.key,group,title:'Example',selectedJobId:selected,onSelect:setSelected,events:[],onDelete:async id=>{const next=structuredClone(run);preserveJobVersions(next);next.jobs=next.jobs.filter(job=>job.id!==id);next.deletedVersions=[{id,candidateId:'direction',version:2,deletedAt:new Date().toISOString()}];setRun(next)}},(job,slots)=>h('article',null,h('h3',null,job.id),slots.switcher)))) }
createRoot(document.getElementById('root')).render(h(App));</script>`,
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
      for (const route of ["review-test", "review-test?room"]) {
        const submissionCount = submissions.length;
        await page.goto(server.resolvedUrls!.local[0] + route);
        await page.waitForSelector(".refinement-history-review .ant-collapse-header");
        await page.click(".refinement-history-review .ant-collapse-header");
        const checkbox = 'input[aria-label="Keep request from version 2"]';
        await page.waitForSelector(checkbox, { visible: true });
        await page.locator(checkbox).click();
        await expect
          .poll(() => page.$eval(checkbox, (node) => (node as HTMLInputElement).checked))
          .toBe(false);
        await page.click("#refresh");
        expect(await page.$eval(checkbox, (node) => (node as HTMLInputElement).checked)).toBe(
          false,
        );
        const sourceSelector = route.includes("?room")
          ? ".room-refinement .ant-select"
          : ".video-refinement .ant-select";
        await page.locator(sourceSelector).click();
        await page
          .locator('.ant-select-dropdown .ant-select-item-option[title*="version 2"]')
          .click();
        await expect
          .poll(() => page.$eval(sourceSelector, (node) => node.textContent))
          .toMatch(/version 2.*Cancelled/);
        await page.type(
          'textarea[aria-label="Fine-tune instructions"]',
          "Keep the selected requests",
        );
        await page.keyboard.press("Enter");
        await expect.poll(() => submissions.length).toBe(submissionCount + 1);
        expect(submissions.at(-1)).toMatchObject({
          jobId: "v2",
          discardedRefinementJobIds: ["v2"],
        });
        await page.locator('.revision-tab:has(input[value="v2"])').click();
        await page.locator('[aria-label="Delete version 2"]').click();
        await page.waitForSelector(".ant-popconfirm");
        expect(await page.$eval("article h3", (node) => node.textContent)).toBe("v2");
        await page.click(".ant-popconfirm .ant-btn-primary");
        await page.waitForFunction(
          () => !document.querySelector('[aria-label="Version 2 · Cancelled"]'),
        );
        expect(await page.$(checkbox)).toBeNull();
        await page.click("#add");
        await page.waitForSelector('[aria-label="Version 4 · Ready"]');
        expect(await page.$('[aria-label="Version 3 · Ready"]')).not.toBeNull();
      }
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(folder, { recursive: true, force: true });
    }
  },
  60000,
);
