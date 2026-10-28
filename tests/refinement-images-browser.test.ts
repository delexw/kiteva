import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { RequestSchema } from "../src/shared/contracts";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

it.skipIf(!browserExecutablePath())(
  "attaches, removes and submits revision images through both refinement interfaces",
  async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "refinement-images-"));
    const file = path.join(folder, "example.png");
    await writeFile(
      file,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const run = {
      id: "example-project",
      phase: "ready",
      createdAt: "2026-01-01",
      request: RequestSchema.parse({
        instructions: "Explain a concept",
        assetIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      }),
      candidates: [],
      jobs: [
        {
          id: "original",
          runId: "example-project",
          candidateId: "direction",
          kind: "full",
          phase: "ready",
          sessionId: "example-session",
          model: "example",
          duration: 20,
          workspace: "/unused",
          video: "film.mp4",
        },
      ],
    };
    const submissions: { jobId: string; prompt: string; assetIds: string[] }[] = [];
    const uploads: string[] = [];
    let failNext = false;
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
          name: "refinement-images-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url === "/api/runs/example-project/assets") {
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    assets: [
                      {
                        id: run.request.assetIds[0],
                        originalName: "example-reference.pdf",
                        bytes: 2048,
                      },
                      {
                        id: run.request.assetIds[1],
                        originalName: "example-reference.png",
                        bytes: 1024,
                      },
                    ],
                  }),
                );
                return;
              }
              if (req.url === "/api/assets" && req.method === "POST") {
                for await (const _ of req) {
                  /* Drain the local multipart fixture. */
                }
                const id = randomUUID();
                uploads.push(id);
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ id, name: `${id}.png`, originalName: "example.png" }));
                return;
              }
              if (req.url?.endsWith("/refine") && req.method === "POST") {
                let body = "";
                for await (const chunk of req) body += chunk;
                submissions.push(JSON.parse(body));
                res.setHeader("Content-Type", "application/json");
                if (failNext) {
                  failNext = false;
                  res.statusCode = 400;
                  res.end(JSON.stringify({ code: "INVALID_REQUEST", error: "Example failure" }));
                } else res.end("{}");
                return;
              }
              if (req.url === "/api/runs/example-project") {
                res.setHeader("Content-Type", "application/json");
                const submitted = submissions.at(-1)!;
                res.end(
                  JSON.stringify({
                    ...run,
                    jobs: [
                      ...run.jobs,
                      {
                        ...run.jobs[0],
                        id: "revision",
                        sourceJobId: "original",
                        refinementPrompt: submitted.prompt,
                        refinementAssetIds: submitted.assetIds,
                        phase: "queued",
                      },
                    ],
                  }),
                );
                return;
              }
              if (req.url?.endsWith("/preview")) {
                res.setHeader("Content-Type", "image/svg+xml");
                res.end(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="white"/></svg>',
                );
                return;
              }
              if (req.url?.startsWith("/api/")) {
                res.setHeader("Content-Type", "application/json");
                res.end("[]");
                return;
              }
              if (!req.url?.startsWith("/refine-test")) return next();
              const legacy = req.url.includes("legacy");
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomProject}from'/src/client/room/room-project.tsx';
import{VideoRefinement}from'/src/client/components/video-refinement.tsx';
function App(){const[run,setRun]=useState(${JSON.stringify(run)});const[view,setView]=useState({tab:'full',refine:''});return React.createElement(${legacy ? "VideoRefinement" : "RoomProject"},{run,onUpdated:setRun,view,onView:setView,events:[],renderFull:()=>null,renderPreview:()=>null,controls:null,onQuestion:()=>{},onEdit:()=>{},onCancel:()=>{},onRetry:()=>{}})}
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
      for (const route of ["/refine-test", "/refine-test?legacy"]) {
        await page.goto(server.resolvedUrls!.local[0] + route.slice(1));
        await page.waitForSelector('[aria-label="Attach refinement images"]');
        const input = await page.$('.refinement-images input[type="file"]');
        await input!.uploadFile(file);
        await page.waitForSelector(".ant-upload-list-item-done");
        await page.locator(".ant-upload-list-item .ant-upload-list-item-action").click();
        await page.waitForFunction(() => !document.querySelector(".ant-upload-list-item"));
        await (await page.$('.refinement-images input[type="file"]'))!.uploadFile(file);
        await page.waitForSelector(".ant-upload-list-item-done");
        await page.type(
          'textarea[aria-label="Fine-tune instructions"]',
          "Match the attached reference",
        );
        failNext = true;
        await page.keyboard.press("Enter");
        await page.waitForSelector('.ant-alert-error, [role="alert"]');
        expect(await page.$(".ant-upload-list-item-done")).not.toBeNull();
        await page.focus('textarea[aria-label="Fine-tune instructions"]');
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => !document.querySelector(".ant-upload-list-item"));
        expect(submissions.at(-1)).toEqual({
          jobId: "original",
          prompt: "Match the attached reference",
          discardedRefinementJobIds: [],
          assetIds: [uploads.at(-1)],
        });
        if (route === "/refine-test") {
          await page.click('[role="tab"][id$="-tab-conversation"]');
          await page.waitForSelector(".refinement-message");
          await page.waitForFunction(() => {
            const files = document.querySelector(".conversation-attachments");
            return (
              files?.textContent?.includes("example-reference.pdf") &&
              files.textContent.includes("example-reference.png")
            );
          });
          expect(
            await page.$eval(".conversation-attachments img", (node) => node.getAttribute("src")),
          ).toBe(`/api/assets/${run.request.assetIds[1]}/preview`);
          await page.click(".conversation-attachments .ant-image");
          await page.waitForSelector(".ant-image-preview", { visible: true });
          expect(
            await page.$eval(".ant-image-preview img", (node) => node.getAttribute("src")),
          ).toBe(`/api/assets/${run.request.assetIds[1]}/preview`);
          await page.locator(".ant-image-preview-close").click();
          await page.waitForSelector(".ant-image-preview", { hidden: true });
          expect(await page.$eval(".refinement-message", (node) => node.textContent)).toContain(
            "Match the attached reference",
          );
          expect(
            await page.$eval(".refinement-message img", (node) => node.getAttribute("src")),
          ).toBe(`/api/assets/${uploads.at(-1)}/preview`);
          await page.click(".refinement-message .ant-image");
          await page.waitForSelector(".ant-image-preview", { visible: true });
          expect(
            await page.$eval(".ant-image-preview img", (node) => node.getAttribute("src")),
          ).toBe(`/api/assets/${uploads.at(-1)}/preview`);
          await page.locator(".ant-image-preview-close").click();
          await page.waitForSelector(".ant-image-preview", { hidden: true });
        }
      }
    } finally {
      await browser.close();
      await server.close();
      await rm(folder, { recursive: true, force: true });
    }
  },
  60000,
);
