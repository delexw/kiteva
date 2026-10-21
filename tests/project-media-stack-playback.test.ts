import { browserDependencyScan } from "../vite.resolve";
import { readFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";

it.skipIf(!browserExecutablePath())(
  "plays replacement stack clips with identical filenames and respects reduced motion",
  async () => {
    const server = await createServer({
      configFile: false,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: { "@": path.join(appRoot, "src/client") } },
      server: { host: "127.0.0.1", port: 0 },
      plugins: [
        react(),
        {
          name: "stack-playback-fixture",
          configureServer(server) {
            server.middlewares.use(async (request, response, next) => {
              if (request.url !== "/stack-playback-test") return next();
              const html = await server.transformIndexHtml(
                request.url,
                `<style>.project-preview-frame { width: 640px; height: 400px; } video { width: 640px; height: 360px; }</style><div id="root"></div><script type="module">
          import { createElement } from 'react';
          import { createRoot } from 'react-dom/client';
          import { ProjectMediaStack } from '/src/client/components/project-media-stack.tsx';
          import { RequestSchema } from '/src/shared/contracts.ts';
          const project = {
            id: 'example-project', createdAt: '2026-01-01', phase: 'ready',
            request: RequestSchema.parse({ instructions: 'An original story' }), candidates: [],
            jobs: ['old', 'new'].map((id, index) => ({
              id, kind: 'full', phase: 'ready', createdAt: '2026-01-0' + (index + 2),
              runId: 'example-project', candidateId: id, outputType: 'video', duration: 90,
              model: 'example-model', workspace: '/tmp/example',
              video: 'renders/full.mp4', cardClip: location.hash === '#fallback' ? undefined : 'renders/card-3s.webm'
            }))
          };
          createRoot(document.getElementById('root')).render(
            createElement(ProjectMediaStack, { project, onOpen() { document.getElementById('root').dataset.opened = 'true'; } })
          );
        </script>`,
              );
              response.setHeader("Content-Type", "text/html");
              response.end(html);
            });
          },
        },
      ],
    });
    const clip = await readFile(path.join(appRoot, "assets/style-previews/style-001.webm"));
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
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (request.url().includes("/api/artifacts/")) {
          void request.respond({ status: 200, contentType: "video/webm", body: clip });
        } else void request.continue();
      });
      await page.goto(`${server.resolvedUrls!.local[0]}stack-playback-test`);
      await page.waitForSelector("video", { timeout: 10000 }).catch(async () => {
        throw new Error(
          `Stack did not mount: ${errors.join("; ")}; ${await page.evaluate(() => document.body.innerText)}`,
        );
      });
      for (const [index, id] of ["new", "old", "new"].entries()) {
        await page.waitForFunction(
          (jobId) => {
            const video = document.querySelector<HTMLVideoElement>(".project-card-clip");
            return (
              video?.currentSrc.includes(`/${jobId}/`) && !video.paused && video.currentTime > 0.1
            );
          },
          { timeout: 10000 },
          id,
        );
        if (index === 0) {
          await page.click(".project-stack-previous");
        } else if (index === 1) await page.click(".project-stack-next");
      }
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await page.reload();
      await page.waitForSelector("video");
      await page.waitForFunction(() => document.querySelector<HTMLVideoElement>("video")?.paused);
      expect(await page.$$eval("video", (videos) => videos.length)).toBe(1);
      expect(await page.$$eval(".project-card-play", (buttons) => buttons.length)).toBe(1);
      await page.goto(`${server.resolvedUrls!.local[0]}stack-playback-test#fallback`);
      await page.reload();
      await page.waitForSelector(".project-card-play");
      expect(await page.$(".project-card-clip")).toBeNull();
      expect(await page.$$eval(".project-card-play", (buttons) => buttons.length)).toBe(1);
      await page.click(".project-card-play");
      expect(await page.$eval("#root", (root) => root.getAttribute("data-opened"))).toBe("true");
    } finally {
      await browser.close();
      await server.close();
    }
  },
  60000,
);
