import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import react from "@vitejs/plugin-react";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserDependencyScan } from "../vite.resolve";
import { appRoot } from "../src/server/runtime/config";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { projectGovernance } from "../src/server/governance/report";
import { RequestSchema, type Run } from "../src/shared/contracts";

it.skipIf(!browserExecutablePath())(
  "expands visual and audio choices through the same Governance table",
  async () => {
    const run: Run = {
      id: "example-project",
      createdAt: "2026-10-22T00:00:00Z",
      phase: "generating",
      request: RequestSchema.parse({ instructions: "Explain an idea" }),
      candidates: [],
      jobs: [
        {
          id: "full",
          runId: "example-project",
          candidateId: "direction",
          kind: "full",
          phase: "generating",
          duration: 60,
          workspace: "/tmp/fixture",
          model: "example-model",
          authoringResources: {
            source: "jev",
            model: "jev-1.14.0",
            selectedIds: ["local_code"],
            decisions: [{ id: "local_code", use: true, probability: 0.82 }],
          },
          audioAuthoring: {
            source: "jev",
            model: "jev-1.14.0",
            selectedId: "audio_studio",
            decisions: [
              { id: "audio_studio", use: true, probability: 0.98 },
              { id: "local_audio", use: false, probability: 0.02 },
            ],
          },
        },
      ],
    };
    const rows = projectGovernance(
      run,
      ["Authoring resource selection", "Audio authoring selection"].map((purpose, id) => ({
        id,
        runId: run.id,
        jobId: "full",
        time: run.createdAt,
        type: "usage",
        message: "",
        data: {
          model: "jev-1.14.0",
          purpose,
          invocationId: String(id),
          input_tokens: 100,
          output_tokens: 10,
        },
      })),
    ).activity;
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "governance-authoring-"));
    const server = await createServer({
      configFile: false,
      root: appRoot,
      cacheDir,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: { "@": path.join(appRoot, "src/client") } },
      server: { host: "127.0.0.1", port: 0, watch: null },
      plugins: [
        react(),
        {
          name: "governance-authoring-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url === "/rows") {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(rows));
              } else if (req.url === "/authoring-test") {
                res.setHeader("Content-Type", "text/html");
                res.end(
                  await server.transformIndexHtml(
                    req.url,
                    `<div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';
import{GovernanceUsageTable}from'/src/client/governance/usage-table.tsx';
import'/src/client/framework.css';import'/src/client/style.css';
const rows=await(await fetch('/rows')).json();createRoot(document.getElementById('root')).render(React.createElement(GovernanceUsageTable,{rows,byFunction:true}));</script>`,
                  ),
                );
              } else next();
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
      await page.setViewport({ width: 1440, height: 1000 });
      await page.goto(`${server.resolvedUrls!.local[0]}authoring-test`);
      await page.waitForSelector(".ant-table-row-expand-icon");
      expect(await page.$eval(".governance-ant-table", (el) => el.textContent)).toContain(
        "Audio Studio (98%)",
      );
      expect(await page.$eval(".governance-ant-table", (el) => el.textContent)).toContain(
        "Existing local code and libraries (82%)",
      );
      const expanders = await page.$$("button.ant-table-row-expand-icon");
      expect(expanders).toHaveLength(2);
      for (const button of expanders) await button.click();
      await page.waitForFunction(
        () => document.querySelectorAll('section[aria-label="Authoring comparison"]').length === 2,
      );
      const details = await page.$$eval('section[aria-label="Authoring comparison"]', (sections) =>
        sections.map((el) => el.textContent),
      );
      expect(details).toHaveLength(2);
      expect(details.join(" ")).toContain("Local audio tools · 2%");
      expect(details.join(" ")).toContain("Audio Studio · 98% · Selected");
      expect(errors).toEqual([]);
    } finally {
      await browser?.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60_000,
);
