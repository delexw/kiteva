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
import type { Storyboard } from "../src/shared/agents/schemas/storyboard";
import { validStoryboard } from "./fixtures/storyboard";

it.skipIf(!browserExecutablePath())(
  "inspects saved tracks in an inline read-only desk with playback, seek, zoom and missing-data recovery",
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "production-desk-browser-"));
    const board: Storyboard = validStoryboard(3);
    board.scenes[0].beats[0].audio.effects = ["Paper sound"];
    const requests: string[] = [];
    const server = await createServer({
      configFile: false,
      cacheDir: directory,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.data/**"] } },
      plugins: [
        react(),
        {
          name: "production-desk-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url?.startsWith("/api/")) requests.push(req.method || "GET");
              if (req.url?.endsWith("/authentication")) {
                res.setHeader("Content-Type", "application/json");
                res.end("[]");
                return;
              }
              if (req.url?.endsWith("/production.json")) {
                res.setHeader("Content-Type", "application/json");
                if (req.url.includes("/pending/"))
                  res.end(
                    JSON.stringify({
                      pipeline: "Multiplane",
                      fallbackReason: null,
                      sourceFile: "artifacts/shots/one.html",
                      duration: 3,
                      width: 320,
                      height: 180,
                      styleRenderer: ["HTML"],
                      motionEngine: ["Time"],
                      audioDescription: "Separate sources",
                      limitations: [],
                      audioFile: "unused-mix.wav",
                      audioTracks: [
                        {
                          id: "music",
                          kind: "music",
                          label: "Saved music source",
                          file: "artifacts/assets/audio/score.wav",
                          startSeconds: 0,
                          durationSeconds: 3,
                          volume: 1,
                        },
                        {
                          id: "effect",
                          kind: "sfx",
                          label: "Saved effect source",
                          file: "artifacts/assets/audio/score.wav",
                          startSeconds: 0.5,
                          durationSeconds: 0.25,
                          volume: 1,
                        },
                      ],
                    }),
                  );
                else {
                  res.statusCode = 404;
                  res.end('{"error":"No production"}');
                }
                return;
              }
              if (req.url?.endsWith("/STORYBOARD.json")) {
                res.setHeader("Content-Type", "application/json");
                if (req.url.includes("/missing/")) {
                  res.statusCode = 404;
                  res.end('{"error":"No storyboard"}');
                } else res.end(JSON.stringify(board));
                return;
              }
              if (req.url?.endsWith("/full.webm")) {
                // Match the backend's native byte-range serving for browser seeking.
                req.url = "/assets/style-previews/style-136.webm";
                return next();
              }
              if (req.url?.endsWith("/score.wav")) {
                req.url = "/assets/speech/ming-tts/original-narrator.wav";
                return next();
              }
              if (req.url?.endsWith("/broken.wav")) {
                res.statusCode = 404;
                res.end("No audio");
                return;
              }
              if (!req.url?.startsWith("/desk-fixture")) return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<!doctype html><style>body{background:#0f0d0b}</style><div id="root"></div><script type="module">
import '/src/client/style.css';import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';import{roomTheme}from'/src/client/theme.ts';
import{VideoPlayer}from'/src/client/components/video-player.tsx';import{RoomProject}from'/src/client/room/room-project.tsx';import{RequestSchema}from'/src/shared/contracts.ts';
const missing=location.search.includes('missing');const pending=location.search.includes('pending');const id=missing?'missing':pending?'pending':'example';
const production={pipeline:'Multiplane',fallbackReason:null,sourceFile:'artifacts/shots/one.html',duration:3,width:320,height:180,fps:30,styleRenderer:['HTML'],motionEngine:['Time'],audioDescription:'Saved mix',audioFile:'artifacts/assets/audio/score.wav',limitations:[]};
if(location.search.includes('brokenAudio'))production.audioFile='artifacts/assets/audio/broken.wav';
if(location.search.includes('sourceTracks'))production.audioTracks=[{id:'music',kind:'music',label:'Music source',file:'artifacts/assets/audio/score.wav',startSeconds:0,durationSeconds:3,volume:1},{id:'hit',kind:'sfx',label:'Effect source',file:'artifacts/assets/audio/score.wav',startSeconds:0.5,durationSeconds:0.25,volume:1}];
const speechTrack={file:'artifacts/assets/audio/narration.wav',durationSeconds:3,source:'narration',cues:[{text:'Saved narration words',startSeconds:0.5,endSeconds:2}]};
const job={id:'full',runId:id,candidateId:'direction',kind:'full',phase:missing?'failed':pending?'generating':'ready',duration:3,workspace:'/tmp/fixture',model:'fixture',storyboardReady:true,...(!missing?{...(!pending?{production,video:'renders/full.webm'}:{}),speechTrack}:{})};
const run={id,createdAt:'2026-01-01',phase:missing?'failed':'ready',request:RequestSchema.parse({instructions:'Example film'}),jobs:[job],candidates:[]};
function App(){const[view,setView]=useState({tab:'storyboard'});const noop=()=>{};return React.createElement(ConfigProvider,{theme:roomTheme},React.createElement('div',{hidden:true},React.createElement(VideoPlayer,{src:'/api/artifacts/example/full/full.webm',loop:true,'aria-label':'Background preview'}),React.createElement(VideoPlayer,{src:'/api/artifacts/example/full/full.webm',loop:true,muted:true,'aria-label':'Silent preview'})),React.createElement(RoomProject,{run,events:[],view,onView:setView,renderPreview:noop,renderFull:noop,onQuestion:noop,onUpdated:noop,onEdit:noop,onCancel:noop,onRetry:noop,controls:null}));}
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
      headless: "shell",
      pipe: true,
    });
    try {
      await server.listen();
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 1000 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture`);
      await page.waitForSelector(".room-desk-open");
      const order = await page.$$eval(".room-storyboard-actions button", (buttons) =>
        buttons.map((button) => button.textContent),
      );
      expect(order).toEqual(["desk", "storyboard"]);
      expect(await page.$$(".room-storyboard-open svg")).toHaveLength(1);
      const originalUrl = page.url();
      const pages = (await browser.pages()).length;
      await page.evaluate(async () => {
        await document.querySelector<HTMLVideoElement>('[aria-label="Background preview"]')!.play();
        await document.querySelector<HTMLVideoElement>('[aria-label="Silent preview"]')!.play();
      });
      expect(
        await page.$eval(
          '[aria-label="Background preview"]',
          (el) => (el as HTMLVideoElement).paused,
        ),
      ).toBe(false);
      await page.click(".room-desk-open");
      await page.waitForFunction(
        () =>
          document.querySelectorAll(".desk-track").length === 4 &&
          document.querySelector<HTMLVideoElement>(".desk-preview video")!.readyState >= 2,
      );
      await page.waitForFunction(() => {
        const dialog = document.querySelector(".ant-modal")!;
        return (
          getComputedStyle(dialog).transform === "none" && getComputedStyle(dialog).opacity === "1"
        );
      });
      expect(await page.$eval(".desk-readonly", (el) => el.textContent)).toContain("Read only");
      expect(await page.$eval(".desk-track-sfx .desk-clip", (el) => el.textContent)).toContain(
        "Planned",
      );
      expect(await page.$$(".production-desk [draggable=true]")).toHaveLength(0);
      expect(
        await page.$eval(
          '[aria-label="Background preview"]',
          (el) => (el as HTMLVideoElement).paused,
        ),
      ).toBe(true);
      expect(
        await page.$eval('[aria-label="Silent preview"]', (el) => (el as HTMLVideoElement).paused),
      ).toBe(false);
      await page.waitForSelector('.desk-track-music [data-waveform-status="ready"]');
      expect(
        await page.$eval(".audio-waveform > span", (el) =>
          Boolean(el.firstElementChild?.shadowRoot?.querySelector("canvas")),
        ),
      ).toBe(true);
      await page.click(".desk-track-narration .desk-clip");
      expect(await page.$eval(".desk-inspector", (el) => el.textContent)).toContain(
        "Saved narration words",
      );
      expect(await page.$eval(".desk-inspector", (el) => el.textContent)).toContain(
        "Measured speech cues",
      );
      await page.click(".desk-track-narration .desk-clip", { count: 2 });
      await page.waitForFunction(
        () =>
          Math.abs(
            document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime - 0.5,
          ) < 0.1,
      );
      await page.focus('[aria-label="Desk playhead"]');
      await page.keyboard.press("End");
      await page.waitForFunction(
        () => document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime > 2.5,
      );
      await page.keyboard.press("Home");
      await page.waitForFunction(
        () => document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime < 0.1,
      );
      await page.click('.desk-transport [aria-label="Play movie"]');
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime > 0.15 &&
          !document.querySelector<HTMLVideoElement>(".desk-preview video")!.paused,
      );
      const playheadLag = await page.evaluate(async () => {
        const video = document.querySelector<HTMLVideoElement>(".desk-preview video")!;
        const lane = document.querySelector(".desk-track-sfx .desk-lane")!;
        const playhead = lane.querySelector(".desk-playhead")!;
        return new Promise<number>((resolve) => {
          let frames = 0;
          let largestLag = 0;
          const sample = () => {
            if (frames > 2) {
              const bounds = lane.getBoundingClientRect();
              const visibleTime =
                ((playhead.getBoundingClientRect().left - bounds.left) / bounds.width) * 3;
              largestLag = Math.max(largestLag, Math.abs(video.currentTime - visibleTime));
            }
            if (++frames < 30) requestAnimationFrame(sample);
            else resolve(largestLag);
          };
          requestAnimationFrame(sample);
        });
      });
      expect(playheadLag).toBeLessThan(0.045);
      expect(
        await page.$$eval(
          "video",
          (media) => media.filter((video) => !video.paused && !video.muted).length,
        ),
      ).toBe(1);
      await page.click('.desk-transport [aria-label="Pause movie"]');
      await page.click('[aria-label="Zoom in"]');
      expect(await page.$eval(".desk-timeline", (el) => (el as HTMLElement).style.minWidth)).toBe(
        "200%",
      );
      await page.click('[aria-label="Fit timeline"]');
      expect(await page.$eval(".desk-timeline", (el) => (el as HTMLElement).style.minWidth)).toBe(
        "100%",
      );
      await page.hover(".ant-modal-title");
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector(".ant-modal")!).transform === "none",
      );
      await page.$eval(".dialog-body", (el) => {
        el.scrollTop = 0;
      });
      await page.screenshot({ path: "/tmp/kiteva-production-desk.png" });
      expect(
        await page.$eval(".desk-preview", (el) => el.getBoundingClientRect().height),
      ).toBeGreaterThan(400);
      expect(
        await page.$eval(".desk-timeline-scroll", (el) => el.getBoundingClientRect().bottom),
      ).toBeGreaterThan(850);
      expect(
        await page.$eval(".ant-modal-container", (el) => {
          const bounds = el.getBoundingClientRect();
          return Math.abs(bounds.height - (window.innerHeight - 32));
        }),
      ).toBeLessThan(2);
      expect(
        await page.$eval(".ant-modal", (el) => {
          const bounds = el.getBoundingClientRect();
          return Math.abs(bounds.width - (window.innerWidth - 32));
        }),
      ).toBeLessThan(2);
      expect(
        await page.$eval(".ant-modal", (el) => {
          const bounds = el.getBoundingClientRect();
          return Math.abs((bounds.top + bounds.bottom) / 2 - window.innerHeight / 2);
        }),
      ).toBeLessThan(16);
      expect(page.url()).toBe(originalUrl);
      expect((await browser.pages()).length).toBe(pages);
      await page.setViewport({ width: 460, height: 1000 });
      expect(
        await page.$eval(".production-desk", (el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      await page.screenshot({ path: "/tmp/kiteva-production-desk-mobile.png" });
      await page.click(".ant-modal-close");
      await page.waitForFunction(() => !document.querySelector(".production-desk"));
      expect(await page.$$(".production-desk video")).toHaveLength(0);
      expect(
        await page.$eval(
          '[aria-label="Background preview"]',
          (el) => (el as HTMLVideoElement).paused,
        ),
      ).toBe(true);
      await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?missing`);
      await page.click(".room-desk-open");
      await page.waitForFunction(() =>
        document
          .querySelector(".desk-notes")
          ?.textContent?.includes("Storyboard could not be loaded"),
      );
      expect(await page.$eval(".desk-preview", (el) => el.textContent)).toContain(
        "No rendered video yet.",
      );
      expect(await page.$('.desk-transport [aria-label="Play movie"][disabled]')).not.toBeNull();
      expect(await page.$$(".desk-track")).toHaveLength(4);
      expect(await page.$$(".desk-clip")).toHaveLength(0);
      await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?brokenAudio`);
      await page.click(".room-desk-open");
      await page.waitForSelector('.desk-track-music [data-waveform-status="error"]');
      expect(await page.$eval(".audio-waveform", (el) => el.textContent)).toContain(
        "Waveform unavailable",
      );
      expect(await page.$$(".desk-track")).toHaveLength(4);
      await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?sourceTracks`);
      await page.click(".room-desk-open");
      await page.waitForSelector('.desk-track-sfx [data-waveform-status="ready"]');
      await page.waitForSelector('.desk-track-music [data-waveform-status="ready"]');
      expect(await page.$$(".desk-track-sfx .desk-clip-planned")).toHaveLength(0);
      await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?pending`);
      await page.click(".room-desk-open");
      await page.waitForSelector('.desk-track-sfx [data-waveform-status="ready"]');
      expect(await page.$eval(".desk-track-sfx", (el) => el.textContent)).toContain(
        "Saved effect source",
      );
      expect(await page.$$(".desk-track-sfx .desk-clip-planned")).toHaveLength(0);
      expect(await page.$('.desk-transport [aria-label="Play movie"][disabled]')).not.toBeNull();
      expect(requests.every((method) => method === "GET")).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);
