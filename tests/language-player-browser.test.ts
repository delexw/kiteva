import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import puppeteer from "puppeteer-core";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserDependencyScan } from "../vite.resolve";
import { command } from "../src/server/runtime/process";

it.skipIf(!browserExecutablePath())(
  "switches audio without losing position and independently switches subtitles and downloads",
  async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "language-player-"));
    const file = path.join(folder, "sample.mp4");
    const signal = AbortSignal.timeout(90000);
    await command(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=320x180:r=12:d=4",
        "-f",
        "lavfi",
        "-i",
        "sine=duration=4",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        file,
      ],
      folder,
      signal,
    );
    const video = await readFile(file);
    const server = await createServer({
      configFile: false,
      root: appRoot,
      cacheDir: path.join(folder, "cache"),
      resolve: { alias: { "@": path.join(appRoot, "src/client") } },
      optimizeDeps: browserDependencyScan,
      plugins: [
        react(),
        {
          name: "language-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url === "/api/setup" || req.url?.startsWith("/api/speech/status")) {
                res.setHeader("content-type", "application/json");
                res.end(
                  JSON.stringify({
                    languageTracksSupported: true,
                    available: true,
                    detail: "Test voice ready",
                  }),
                );
                return;
              }
              if (req.url?.endsWith(".mp4")) {
                res.setHeader("content-type", "video/mp4");
                res.setHeader("accept-ranges", "bytes");
                const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
                if (range) {
                  const start = Number(range[1]),
                    end = range[2]
                      ? Math.min(Number(range[2]), video.length - 1)
                      : video.length - 1;
                  res.statusCode = 206;
                  res.setHeader("content-range", `bytes ${start}-${end}/${video.length}`);
                  res.setHeader("content-length", end - start + 1);
                  res.end(video.subarray(start, end + 1));
                } else {
                  res.setHeader("content-length", video.length);
                  res.end(video);
                }
                return;
              }
              if (req.url?.endsWith(".vtt")) {
                res.setHeader("content-type", "text/vtt");
                res.end("WEBVTT\n\n1\n00:00:00.000 --> 00:00:04.000\nExample subtitle\n");
                return;
              }
              if (req.url !== "/test") return next();
              res.setHeader("content-type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';
import{VideoPlayer}from'/src/client/components/video-player.tsx';import{LanguageMediaDownloads}from'/src/client/components/language-media-downloads.tsx';
import'/src/client/framework.css';
import{ScriptItems}from'/src/client/components/script-items.tsx';import{LanguageTrackSettings}from'/src/client/components/language-track-settings.tsx';import{VideoLanguageControl}from'/src/client/components/video-language-control.tsx';import{VideoRequestSchema}from'/src/shared/domains/video.ts';
const media={narration:['en','zh'].map(language=>({language,video:'/'+language+'.mp4',audio:'/'+language+'.wav',mix:'/'+language+'.m4a'})),subtitles:['en','zh'].map(language=>({language,vtt:'/'+language+'.vtt',srt:'/'+language+'.srt'})),musicVideo:'/music.mp4',defaultNarration:'en',defaultSubtitle:'zh'};
function Page(){const[request,setRequest]=React.useState(VideoRequestSchema.parse({instructions:'Explain an example process',outputLanguage:'en',scriptItems:[{id:'spoken',text:'Example words',startSeconds:0,endSeconds:3,showSubtitles:true,speech:{mode:'narration',voice:'af_heart'}}]}));return React.createElement(React.Fragment,null,React.createElement(VideoPlayer,{src:'/sample.mp4','aria-label':'Example film',languageMedia:media}),React.createElement(LanguageMediaDownloads,{media,downloadName:"example-style-v7"}),React.createElement(LanguageTrackSettings,{request,onChange:languageTracks=>setRequest({...request,languageTracks})}),React.createElement(ScriptItems,{items:request.scriptItems,duration:request.duration,languageTracks:request.languageTracks,onChange:scriptItems=>setRequest({...request,scriptItems})}),React.createElement(VideoLanguageControl,{value:request.outputLanguage,onChange:outputLanguage=>setRequest({...request,outputLanguage})}),React.createElement('pre',{id:'request'},JSON.stringify(request)));}createRoot(document.getElementById('root')).render(React.createElement(Page));
</script>`,
                ),
              );
            });
          },
        },
      ],
      server: { host: "127.0.0.1", port: 0, watch: null },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string") throw Error("No test address");
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: browserExecutablePath(),
      args: ["--autoplay-policy=no-user-gesture-required"],
    });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${address.port}/test`);
      await page.waitForFunction(() => (document.querySelector("video")?.readyState ?? 0) >= 1);
      // Shared controls overlay the media instead of adding height below it.
      await page.mouse.move(799, 599);
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector(".kiteva-playback-overlay")!).opacity === "0",
      );
      expect(
        await page.$eval(".kiteva-video-player", (player) => {
          const video = player.querySelector("video")!.getBoundingClientRect();
          const bar = player.querySelector(".kiteva-playback-bar")!.getBoundingClientRect();
          return {
            sameHeight: Math.abs(player.getBoundingClientRect().height - video.height) < 1,
            barInside: bar.bottom <= video.bottom + 1 && bar.top >= video.top,
          };
        }),
      ).toEqual({ sameHeight: true, barInside: true });
      await page.hover(".kiteva-video-player");
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector(".kiteva-playback-overlay")!).opacity === "1",
      );
      await page.mouse.move(799, 599);
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector(".kiteva-playback-overlay")!).opacity === "0",
      );
      await page.focus('[aria-label="Play video"]');
      await page.keyboard.press("Tab");
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector(".kiteva-playback-overlay")!).opacity === "1",
      );
      await page.evaluate(() => (document.activeElement as HTMLElement).blur());
      await page.evaluate(() => {
        document.querySelector("video")!.currentTime = 1.25;
      });
      await page.waitForFunction(
        () =>
          Math.abs((document.querySelector("video")?.currentTime ?? 0) - 1.25) < 0.05 &&
          !document.querySelector("video")?.seeking,
      );
      await page.waitForSelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden)", {
        hidden: true,
      });
      await page.click('[aria-label="Narration language"]');
      await page.waitForSelector(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="简体中文"]',
        { visible: true },
      );
      await page
        .locator(
          '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="简体中文"]',
        )
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector("video")?.currentSrc.endsWith("/zh.mp4") &&
          (document.querySelector("video")?.readyState ?? 0) >= 1,
      );
      await page.waitForFunction(
        () =>
          Math.abs((document.querySelector("video")?.currentTime ?? 0) - 1.25) < 0.05 &&
          !document.querySelector("video")?.seeking,
      );
      expect(await page.$eval("video", (v) => v.currentTime)).toBeCloseTo(1.25, 1);
      expect(await page.$eval("video", (v) => v.paused)).toBe(true);
      await page.evaluate(() => {
        document.querySelector("video")!.currentTime = 0.5;
      });
      await page.click('[aria-label="Play video"]');
      await page.waitForFunction(() => !document.querySelector("video")?.paused);
      await page.waitForSelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden)", {
        hidden: true,
      });
      await page.click('[aria-label="Narration language"]');
      await page.waitForSelector(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="English"]',
        { visible: true },
      );
      await page
        .locator(
          '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="English"]',
        )
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector("video")?.currentSrc.endsWith("/en.mp4") &&
          !document.querySelector("video")?.paused &&
          (document.querySelector("video")?.currentTime ?? 0) >= 0.5,
      );
      await page.click('[aria-label="Pause video"]');
      await page.waitForSelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden)", {
        hidden: true,
      });
      await page.click('[aria-label="Subtitle language"]');
      await page.waitForSelector(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="Off"]',
        { visible: true },
      );
      await page
        .locator(
          '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="Off"]',
        )
        .click();
      await page.waitForFunction(() =>
        Array.from(document.querySelector("video")!.textTracks).every(
          (track) => track.mode === "disabled",
        ),
      );
      expect(await page.$eval("video", (v) => v.currentSrc)).toContain("/en.mp4");
      await page.waitForSelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden)", {
        hidden: true,
      });
      await page.click('[aria-label="Download narration language"]');
      await page.waitForSelector(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="简体中文"]',
        { visible: true },
      );
      await page
        .locator(
          '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="简体中文"]',
        )
        .click();
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("a")).some(
          (a) => a.textContent === "Download MP4" && a.getAttribute("href") === "/zh.mp4",
        ),
      );
      await page.waitForSelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden)", {
        hidden: true,
      });
      expect(await page.$eval('a[href="/zh.mp4"]', (a) => a.getAttribute("download"))).toBe(
        "example-style-v7-zh.mp4",
      );
      expect(await page.$eval('a[href="/zh.m4a"]', (a) => a.getAttribute("download"))).toBe(
        "example-style-v7-zh-mix.m4a",
      );
      await page.click('[aria-label="Download audio type"]');
      await page.waitForSelector(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="Narration only"]',
        {
          visible: true,
        },
      );
      await page
        .locator(
          '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="Narration only"]',
        )
        .click();
      expect(
        await page.$$eval("a", (links) =>
          links.find((a) => a.textContent === "Download audio")?.getAttribute("href"),
        ),
      ).toBe("/zh.wav");
      expect(await page.$eval('a[href="/zh.wav"]', (a) => a.getAttribute("download"))).toBe(
        "example-style-v7-zh-voice.wav",
      );
      await page.waitForSelector('section[aria-label="Narration voice en"]');
      expect(await page.$('[aria-label="Multiple language tracks"]')).toBeNull();
      expect(await page.$('.script-items [aria-label="Speech language"]')).toBeNull();
      expect(await page.$('[aria-label="Default language"]')).toBeNull();
      expect(await page.$('[aria-label="Subtitles when playback starts"]')).toBeNull();
      const order = await page.$eval(".language-track-settings", (el) => {
        const card = el.querySelector(".language-track-voice")!;
        return Boolean(
          card.compareDocumentPosition(el.querySelector(".language-track-add")!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      });
      expect(order).toBe(true);
      await page.click('[aria-label="Add language"]');
      await page
        .locator(
          '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="简体中文"]',
        )
        .click();
      await page.keyboard.press("Escape");
      await page.waitForFunction(() =>
        JSON.parse(
          document.querySelector("#request")!.textContent!,
        ).languageTracks.subtitles.includes("zh"),
      );
      const request = await page.$eval("#request", (el) => JSON.parse(el.textContent!));
      expect(request.languageTracks.narration[0].language).toBe("en");
      expect(request.outputLanguage).toBe("en");
      expect(request.languageTracks.subtitles).toEqual(["en", "zh"]);
      expect(
        request.languageTracks.narration.map((track: { language: string }) => track.language),
      ).toEqual(["en", "zh"]);
      expect(await page.$('.script-items [aria-label="Speech language"]')).toBeNull();
      expect(await page.$('.script-items [aria-label="Narrator voice"]')).toBeNull();
      expect(await page.$('.script-items [aria-label="Narration"]')).toBeNull();
      expect(await page.$('.script-items [aria-label="Show subtitles on screen"]')).toBeNull();
      expect(await page.$('[aria-label="Add language"]')).not.toBeNull();
      await page.click('[aria-label="Remove language en"]');
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector("#request")!.textContent!).languageTracks.narration
            .length === 1,
      );
      const chinese = await page.$eval("#request", (element) => JSON.parse(element.textContent!));
      expect(
        chinese.languageTracks.narration.map((track: { language: string }) => track.language),
      ).toEqual(["zh"]);
      expect(chinese.languageTracks.subtitles).toEqual(["zh"]);
      expect(chinese.languageTracks.defaultNarration).toBe("zh");
      expect(chinese.languageTracks.defaultSubtitle).toBe("zh");
      await page.click('.language-track-settings [aria-label="Show subtitles on screen"]');
      const global = await page.$eval("#request", (element) => JSON.parse(element.textContent!));
      expect(global.languageTracks.showSubtitles).toBe(false);
      expect(global.languageTracks.defaultSubtitle).toBe("off");
      expect(
        await page.$$('section[aria-label="Narration voice en"] [aria-label="Speech mode"]'),
      ).toHaveLength(0);
      await (await page.$(".language-track-settings"))!.screenshot({
        path: "/tmp/kiteva-language-tracks-browser.png",
      });
      await (await page.$(".script-items"))!.screenshot({
        path: "/tmp/kiteva-timed-script-inherited.png",
      });
      await page.click('[aria-label="Remove language zh"]');
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector("#request")!.textContent!).languageTracks.narration
            .length === 0,
      );
      expect(await page.$('.script-items [aria-label="Speech language"]')).toBeNull();
      expect(await page.$('.script-items [aria-label="Narrator voice"]')).toBeNull();
      expect(await page.$('.script-items [aria-label="Narration"]')).toBeNull();
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.waitForSelector(".kiteva-playback-overlay");
      expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector(".kiteva-playback-overlay")!).opacity === "1",
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(folder, { recursive: true, force: true });
    }
  },
  90000,
);
