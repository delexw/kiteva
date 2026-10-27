import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it, vi } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";
import {
  startAuthenticationBridge,
  pendingReferenceAuthentications,
  answerReferenceAuthentication,
} from "../src/server/agents/capabilities/reference-browser/authentication-bridge";
import { waitForProjectAuthentication } from "../src/server/agents/capabilities/reference-browser/authentication-client";

it.skipIf(!browserExecutablePath())(
  "shows working provider-neutral sign-in controls while the tool is blocked",
  async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "sign-in-ui-"));
    const controller = new AbortController();
    const bridge = await startAuthenticationBridge(workspace, controller.signal, () => {});
    vi.stubEnv("KITEVA_AUTH_BRIDGE_URL", bridge.url);
    vi.stubEnv("KITEVA_AUTH_BRIDGE_TOKEN", bridge.token);
    let focused = false,
      finished = false;
    const waiting = waitForProjectAuthentication(
      "https://example.com",
      controller.signal,
      async () => {
        focused = true;
      },
      async () => {},
    ).then(() => {
      finished = true;
    });
    void waiting.catch(() => {});
    const server = await createServer({
      configFile: false,
      cacheDir: path.join(workspace, "vite"),
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      plugins: [
        react(),
        {
          name: "sign-in-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url === "/api/runs/project/authentication") {
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify(pendingReferenceAuthentications(workspace)));
                return;
              }
              if (req.url?.startsWith("/api/runs/project/authentication/")) {
                const chunks: Buffer[] = [];
                for await (const chunk of req) chunks.push(chunk);
                const { action } = JSON.parse(Buffer.concat(chunks).toString());
                answerReferenceAuthentication(workspace, req.url.split("/").at(-1)!, action);
                res.setHeader("content-type", "application/json");
                res.end("{}");
                return;
              }
              if (req.url !== "/sign-in-test") return next();
              res.setHeader("content-type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{ReferenceSignIn}from'/src/client/components/reference-sign-in.tsx';createRoot(document.getElementById('root')).render(React.createElement(ReferenceSignIn,{runId:'project',revision:1}));</script>`,
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
    });
    try {
      await vi.waitFor(() => expect(pendingReferenceAuthentications(workspace)).toHaveLength(1));
      await server.listen();
      const address = server.httpServer!.address();
      if (!address || typeof address === "string") throw Error("Fixture has no port");
      const page = await browser.newPage();
      await page.setViewport({ width: 1100, height: 500 });
      await page.goto(`http://127.0.0.1:${address.port}/sign-in-test`);
      await page.waitForFunction(() =>
        document.body.innerText.includes("Waiting for you to sign in"),
      );
      expect(finished).toBe(false);
      expect(await page.$eval("[role=alert]", (element) => element.textContent)).toContain(
        "https://example.com",
      );
      await page.screenshot({ path: "/tmp/kiteva-sign-in-wait.png" });
      const buttons = await page.$$("button");
      await buttons[0].click();
      await vi.waitFor(() => expect(focused).toBe(true));
      expect(finished).toBe(false);
      await buttons[1].click();
      await waiting;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !document.querySelector("[role=alert]"));
      expect(await page.$("[role=alert]")).toBeNull();
    } finally {
      controller.abort();
      await bridge.close();
      vi.unstubAllEnvs();
      await browser.close();
      await server.close();
      await rm(workspace, { recursive: true, force: true });
    }
  },
  45000,
);
