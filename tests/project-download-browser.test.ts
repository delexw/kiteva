import { mkdtemp, rm, readFile } from "node:fs/promises";
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
  "shows an editable download for failed jobs only when files exist",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "project-download-"));
    let available = true;
    const server = await createServer({
      configFile: false,
      cacheDir,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      plugins: [
        react(),
        {
          name: "download-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url === "/api/projects/run/job/availability") {
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ available }));
                return;
              }
              if (req.url === "/api/projects/run/job") {
                res.setHeader("Content-Type", "application/zip");
                res.end("local archive fixture");
                return;
              }
              if (req.url !== "/download-test") return next();
              res.setHeader("content-type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{ProjectDownload}from'/src/client/components/project-download.tsx';createRoot(document.getElementById('root')).render(React.createElement(ProjectDownload,{run:{id:'run',candidates:[{id:'direction',displayTitle:'Channel Surf'}],jobs:[{id:'job',candidateId:'direction',kind:'full',version:7}]},job:{id:'job',candidateId:'direction',kind:'full',phase:'failed',version:7}}));</script>`,
                ),
              );
            });
          },
        },
      ],
      server: { host: "127.0.0.1", port: 0 },
    });
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath()!,
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      await server.listen();
      const page = await browser.newPage();
      const address = server.httpServer!.address();
      if (!address || typeof address === "string") throw Error("No fixture port");
      await page.goto(`http://127.0.0.1:${address.port}/download-test`);
      await page.waitForSelector("a[download]");
      expect(
        await page.$eval("a", (a) => ({
          label: a.getAttribute("aria-label"),
          text: a.textContent,
          href: a.getAttribute("href"),
          download: a.getAttribute("download"),
          icons: a.querySelectorAll("svg").length,
        })),
      ).toEqual({
        label: "Download editable project",
        text: "",
        href: "/api/projects/run/job",
        download: "channel-surf-v7.zip",
        icons: 1,
      });
      const session = await page.createCDPSession();
      await session.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: cacheDir,
      });
      await page.click("a[download]");
      await expect
        .poll(async () => {
          try {
            return await readFile(path.join(cacheDir, "channel-surf-v7.zip"), "utf8");
          } catch {
            return "";
          }
        })
        .toBe("local archive fixture");
      await page.hover("a[download]");
      await page.waitForSelector('[role="tooltip"]', { visible: true });
      expect(await page.$eval('[role="tooltip"]', (element) => element.textContent)).toBe(
        "Download editable source files and assets as a ZIP.",
      );
      available = false;
      await page.reload();
      await page.waitForNetworkIdle();
      expect(await page.$("a[download]")).toBeNull();
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  30000,
);
