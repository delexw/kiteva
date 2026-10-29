import { credentialEnvironmentVariables } from "../src/server/runtime/credential-environment";
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
  "keeps late sign-in controls visible while a real project is scrolled at desktop and small widths",
  async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "sign-in-ui-"));
    const controller = new AbortController();
    const bridge = await startAuthenticationBridge(workspace, controller.signal, () => {});
    vi.stubEnv("KITEVA_AUTH_BRIDGE_URL", bridge.url);
    vi.stubEnv(credentialEnvironmentVariables.authenticationBridgeToken, bridge.token);
    let focused = false,
      finished = false;
    const startWaiting = () =>
      waitForProjectAuthentication(
        "https://example.com",
        controller.signal,
        async () => {
          focused = true;
        },
        async () => {},
      ).then(() => {
        finished = true;
      });
    let waiting: Promise<unknown> | undefined;
    let checks = 0;
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
                checks++;
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
                  `<style>.room-project{height:400px}</style><div class="room-window is-mobile-front"><div class="room-window-content is-fill"><div id="root"></div></div></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';
import{RoomProject}from'/src/client/room/room-project.tsx';
import{RequestSchema}from'/src/shared/contracts.ts';
import'/src/client/room/room.css';
const run={id:'project',phase:'generating',createdAt:'2026-01-01',request:RequestSchema.parse({instructions:'Example project knowledge. '.repeat(300)}),candidates:[],jobs:[]};
const noop=()=>{};
createRoot(document.getElementById('root')).render(React.createElement(RoomProject,{run,events:[],view:{tab:'previews',refine:''},onView:noop,renderPreview:()=>null,renderFull:()=>null,controls:React.createElement('div',{style:{height:1500}},'Long project content'),onQuestion:noop,onUpdated:noop,onEdit:noop,onCancel:noop,onRetry:noop}));</script>`,
                ),
              );
            });
          },
        },
      ],
      server: { host: "127.0.0.1", port: 0, watch: null },
    });
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath()!,
      headless: true,
    });
    try {
      await server.listen();
      const address = server.httpServer!.address();
      if (!address || typeof address === "string") throw Error("Fixture has no port");
      const page = await browser.newPage();
      await page.setViewport({ width: 1100, height: 500 });
      await page.goto(`http://127.0.0.1:${address.port}/sign-in-test`);
      await vi.waitFor(() => expect(checks).toBeGreaterThan(0));
      expect(await page.$("[role=alert]")).toBeNull();
      waiting = startWaiting();
      void waiting.catch(() => {});
      await vi.waitFor(() => expect(pendingReferenceAuthentications(workspace)).toHaveLength(1));
      // Returning from the authentication window recovers pending state even if a live event was missed.
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForFunction(() =>
        document.body.innerText.includes("Waiting for you to sign in"),
      );
      expect(finished).toBe(false);
      expect(await page.$eval("[role=alert]", (element) => element.textContent)).toContain(
        "https://example.com",
      );
      for (const width of [1100, 480]) {
        await page.setViewport({ width, height: 600 });
        await page.$eval(".room-project-scroll", (element) => {
          element.scrollTop = element.scrollHeight;
        });
        await page.waitForFunction(
          () => document.querySelector(".room-project-scroll")!.scrollTop > 0,
        );
        const layout = await page.evaluate(() => {
          const button = [...document.querySelectorAll("button")].find((element) =>
            element.textContent?.includes("Continue after signing in"),
          )!;
          const bounds = button.getBoundingClientRect();
          const project = document.querySelector(".room-project")!.getBoundingClientRect();
          return {
            outsideScroll: button.closest(".room-project-scroll") === null,
            visible:
              bounds.top >= project.top &&
              bounds.bottom <= project.bottom &&
              bounds.left >= 0 &&
              bounds.right <= innerWidth,
          };
        });
        expect(layout).toEqual({ outsideScroll: true, visible: true });
      }
      await page.screenshot({ path: "/tmp/kiteva-sign-in-wait.png" });
      const buttons = await page.$$(".room-project-attention button");
      await buttons[0].click();
      await vi.waitFor(() => expect(focused).toBe(true));
      expect(finished).toBe(false);
      await buttons[1].click();
      await waiting;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
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
