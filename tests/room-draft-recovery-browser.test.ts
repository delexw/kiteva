import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { appRoot } from "../src/server/runtime/config";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { browserAliases, browserDependencyScan } from "../vite.resolve";
import { applyRoomPatch, RoomPatchSchema, RoomStateSchema } from "../src/shared/room";
import { newRoomWindow } from "../src/client/room/window-lifecycle";

it.skipIf(!browserExecutablePath())(
  "allows deleting only a broken editing draft from the error view",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "draft-recovery-"));
    let room = RoomStateSchema.parse({
      windows: [newRoomWindow("assistant")],
      drafts: {
        "edit:example": {
          request: {
            instructions: "Keep this brief",
            scriptItems: [{ id: "invalid", speech: { mode: "invalid" } }],
          },
        },
        "edit:other": { request: { instructions: "Keep this other draft" } },
        new: { request: { instructions: "Keep this new idea" } },
      },
    });
    const fixture = `<!doctype html><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import{CreativeRoom}from'/src/client/room/creative-room.tsx';import'/src/client/style.css';import'/src/client/framework.css';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(CreativeRoom,{projects:[],styles:[],examples:[],editSourceId:'example',onHome(){},onOpen(){},onCreated(){},onDeleted(){},onLaunch(){},onNavigate(){},onUpdated(){}})));
</script>`;
    const server = await createServer({
      configFile: false,
      root: appRoot,
      cacheDir,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: null },
      plugins: [
        react(),
        {
          name: "draft-recovery-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url?.startsWith("/api/")) {
                let body = "";
                for await (const chunk of req) body += chunk;
                let result: unknown = [];
                if (req.url === "/api/room") {
                  if (req.method === "PATCH") {
                    const applied = applyRoomPatch(room, RoomPatchSchema.parse(JSON.parse(body)));
                    room = applied.state;
                    result = applied;
                  } else result = room;
                } else if (
                  req.url === "/api/runs/example" ||
                  req.url === "/api/runs/example/assets"
                ) {
                  res.statusCode = 404;
                  result = { error: "Fixture source unavailable" };
                }
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(result));
                return;
              }
              if (req.url !== "/draft-test") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(await server.transformIndexHtml(req.url, fixture));
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
      await page.goto(`${server.resolvedUrls!.local[0]}draft-test`);
      await page.waitForFunction(() =>
        document.body.textContent?.includes("Assistant couldn’t be shown"),
      );
      const removeButton = '.room-window .ant-alert button[aria-label="Remove draft"]';
      expect(await page.$eval(removeButton, (button) => button.textContent?.trim())).toBe("");
      expect(await page.$(`${removeButton} svg`)).not.toBeNull();
      await page.$eval(removeButton, (button) => (button as HTMLButtonElement).click());
      await page.waitForSelector('[role="dialog"]', { visible: true });
      expect(room.drafts["edit:example"]).toBeDefined();
      await page.locator(".ant-modal .ant-btn-dangerous").click();
      await expect.poll(() => room.drafts["edit:example"]).toBeUndefined();
      expect(room.drafts["edit:other"].request.instructions).toBe("Keep this other draft");
      expect(room.drafts.new.request.instructions).toBe("Keep this new idea");
      await page.waitForFunction(
        () => !document.body.textContent?.includes("Assistant couldn’t be shown"),
      );
      await page.reload();
      await page.waitForSelector(".room-assistant");
      expect(room.drafts["edit:example"]).toBeUndefined();
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
