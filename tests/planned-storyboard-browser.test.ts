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
  "opens, plays and closes the storyboard inline without navigating or creating a tab",
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
              if (req.url === "/api/runs/example/authentication") {
                res.setHeader("Content-Type", "application/json");
                res.end("[]");
                return;
              }
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
import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ConfigProvider}from'antd';import{roomTheme}from'/src/client/theme.ts';
import{RoomProject}from'/src/client/room/room-project.tsx';
import{StoryboardPage}from'/src/client/storyboard-page.tsx';
import{RequestSchema}from'/src/shared/contracts.ts';
function App(){const[ready,setReady]=useState(false);const[view,setView]=useState({tab:'storyboard'});const noop=()=>{};
const job={id:'full',runId:'example',candidateId:'direction',kind:'full',phase:'generating',duration:30,workspace:'/tmp/example',model:'example',storyboardReady:ready};
const run={id:'example',createdAt:'2026-01-01',phase:'generating',request:RequestSchema.parse({instructions:'Explain knowledge'}),jobs:[job],candidates:[]};
return React.createElement(React.Fragment,null,React.createElement('button',{id:'publish-plan',onClick:()=>setReady(true)},'Finish planning'),React.createElement(RoomProject,{run,events:[],view,onView:setView,renderPreview:noop,renderFull:noop,onQuestion:noop,onUpdated:noop,onEdit:noop,onCancel:noop,onRetry:noop,controls:null}));}
createRoot(document.getElementById('root')).render(React.createElement(ConfigProvider,{theme:roomTheme},React.createElement(location.pathname.startsWith('/projects/')?()=>React.createElement(StoryboardPage,{projectId:'example',jobId:'full',onBack:()=>{}}):App)));</script>`,
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
      expect(await page.$(".room-storyboard-open")).toBeNull();
      await page.click("#publish-plan");
      await page.waitForSelector(".room-storyboard-open");
      const originalUrl = page.url();
      const originalPageCount = (await browser.pages()).length;
      await page.click(".room-storyboard-open");
      await page.waitForSelector('[role="dialog"]');
      await page.waitForSelector('[aria-label="Animated manga rehearsal"]');
      await page.waitForFunction(
        () =>
          Number((document.querySelector('[aria-label="Movie time"]') as HTMLInputElement)?.value) >
          0,
      );
      expect(
        await page.$eval('[aria-label="Animated manga rehearsal"]', (el) => el.textContent),
      ).toContain("A shape unfolds");
      expect(page.url()).toBe(originalUrl);
      expect((await browser.pages()).length).toBe(originalPageCount);
      await page.waitForFunction(() => {
        const dialog = document.querySelector(".ant-modal");
        return (
          dialog &&
          getComputedStyle(dialog).transform === "none" &&
          getComputedStyle(dialog).opacity === "1"
        );
      });
      expect(await page.$('[role="alert"]')).toBeNull();
      expect(await page.$(".storyboard-page .page-template-header")).toBeNull();
      const header = await page.$eval(".storyboard-dialog-heading", (el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
        height: el.getBoundingClientRect().height,
        text: el.textContent,
      }));
      expect(header.color).toBe("rgb(243, 238, 231)");
      expect(header.background).toBe("rgba(0, 0, 0, 0)");
      expect(header.height).toBeLessThan(60);
      expect(
        await page.$eval(".storyboard-dialog-heading p", (el) => ({
          color: getComputedStyle(el).color,
          opacity: getComputedStyle(el).opacity,
        })),
      ).toEqual({ color: "rgb(243, 238, 231)", opacity: "0.75" });
      expect(header.text).toContain("An idea unfolds");
      expect(header.text).toContain("1 scenes · 0:30");
      expect(await page.$eval(".ant-modal", (el) => el.textContent)).not.toContain(
        "Back to project",
      );
      expect(await page.$eval(".ant-modal", (el) => el.textContent)).not.toContain(
        "WORKSPACE / STORYBOARD",
      );
      const controlColors = () =>
        page.$eval(".movie-controls .ant-btn", (el) => ({
          foreground: getComputedStyle(el).color,
          background: getComputedStyle(el).backgroundColor,
        }));
      expect(await controlColors()).toEqual({
        foreground: "rgb(21, 21, 21)",
        background: "rgb(255, 255, 255)",
      });
      await page.hover(".movie-controls .ant-btn");
      await expect
        .poll(controlColors)
        .toEqual({ foreground: "rgb(21, 21, 21)", background: "rgb(245, 247, 252)" });
      await page.hover(".ant-modal-title");
      await page.setViewport({ width: 1280, height: 1100 });
      await page.waitForFunction(() => {
        const area = document
          .querySelector(".storyboard-dialog-animation")!
          .getBoundingClientRect();
        const movie = document.querySelector(".manga-storyboard")!.getBoundingClientRect();
        return (
          Math.abs((area.top + area.bottom - movie.top - movie.bottom) / 2) < 1 &&
          Math.abs((area.left + area.right - movie.left - movie.right) / 2) < 1
        );
      });
      await page.$eval(".dialog-body", (el) => {
        el.scrollTop = 0;
      });
      await page.screenshot({ path: "/tmp/kiteva-storyboard-inline-dialog.png" });
      expect(
        await page.$eval(".ant-modal-container", (el) => {
          const bounds = el.getBoundingClientRect();
          return {
            horizontal: Math.abs((bounds.left + bounds.right) / 2 - window.innerWidth / 2),
            vertical: Math.abs((bounds.top + bounds.bottom) / 2 - window.innerHeight / 2),
          };
        }),
      ).toEqual({ horizontal: 0, vertical: 0 });
      await page.click(".ant-modal-close");
      await page.waitForFunction(
        () => !document.querySelector('[aria-label="Animated manga rehearsal"]'),
      );
      expect(page.url()).toBe(originalUrl);
      expect(errors).toEqual([]);
    } finally {
      await browser?.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
