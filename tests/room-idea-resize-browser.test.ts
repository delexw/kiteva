import { setTimeout as delay } from "node:timers/promises";
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

it.skipIf(!browserExecutablePath())(
  "resizes a long idea from its top edge inside the assistant dialog",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "room-idea-resize-"));
    const server = await createServer({
      configFile: false,
      cacheDir,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.data/**", "**/dist/**"] } },
      plugins: [
        react(),
        {
          name: "idea-resize-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/idea-resize-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
import{roomEditDraft}from'/src/client/room/onboarding.ts';
import{RequestSchema}from'/src/shared/contracts.ts';
import '/src/client/room/room.css';
const idea='Act 1: <style id="style-140">Vintage Rubber Hose Animation</style>. '+('Keep the original story, references and exact timing.\\n'.repeat(60));
const source={id:'example-project',createdAt:'2026-01-01',phase:'ready',request:RequestSchema.parse({instructions:idea}),candidates:[],jobs:[{id:'original',kind:'full',candidateId:'direction'},{id:'revision',kind:'full',candidateId:'direction',createdAt:'2026-01-03',refinementPrompt:'Make the opening clearer'}],assetQuestions:[{id:'question',state:'answered',kind:'reference',question:'Which example?',answer:'Use the supplied example',answeredAt:'2026-01-02'}]};
function App(){const[draft,setDraft]=useState({...roomEditDraft(source,[]),step:0});return React.createElement(React.Fragment,null,React.createElement('div',{className:'room-assistant-body',id:'dialog',style:{height:540,width:800}},React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:[{id:'style-140',name_en:'Vintage Rubber Hose Animation'}],examples:[],onCreated(){},onUpload:async()=>[]})),React.createElement('output',{id:'state'},JSON.stringify(draft)));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
              );
              res.setHeader("Content-Type", "text/html");
              res.end(html);
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
      await page.setViewport({ width: 1000, height: 700 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`${server.resolvedUrls!.local[0]}idea-resize-test`);
      const editor = '.room-idea-splitter [role="textbox"]';
      const separator = '.room-idea-splitter [role="separator"]';
      await page.waitForFunction(() =>
        Boolean(
          document
            .querySelector('[role="textbox"]')
            ?.textContent?.includes("Keep the original story"),
        ),
      );
      const editorText = await page.$eval(editor, (el) => el.textContent || "");
      expect(editorText).toContain("Which example?");
      expect(editorText).toContain("Use the supplied example");
      expect(editorText).toContain("Make the opening clearer");
      expect(editorText.indexOf("Which example?")).toBeLessThan(
        editorText.indexOf("Make the opening clearer"),
      );
      const before = await (await page.$(editor))!.boundingBox();
      const handle = await (await page.$(separator))!.boundingBox();
      const original = await page.$eval("#state", (el) => el.textContent);
      expect(before!.height).toBeGreaterThan(100);
      expect(handle!.y).toBeLessThan(before!.y);
      await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle!.x + handle!.width / 2, handle!.y - 65, { steps: 12 });
      await page.mouse.up();
      await page.waitForFunction(
        (height) =>
          document.querySelector('[role="textbox"]')!.getBoundingClientRect().height > height + 40,
        {},
        before!.height,
      );
      await page.waitForFunction(() => !document.querySelector(".ant-splitter-bar-dragger-active"));
      const expanded = await (await page.$(editor))!.boundingBox();
      expect(expanded!.width).toBeCloseTo(before!.width, 0);
      // Ant Design ignores a second drag within its double-click interval.
      await delay(350);
      const moved = await (await page.$(separator))!.boundingBox();
      await (await page.$(separator))!.hover();
      await page.mouse.down();
      await page.mouse.move(moved!.x + moved!.width / 2, moved!.y + 45, { steps: 12 });
      await page.mouse.up();
      await page.waitForFunction(() => !document.querySelector(".ant-splitter-bar-dragger-active"));
      await page.waitForFunction(
        (height) =>
          document.querySelector('[role="textbox"]')!.getBoundingClientRect().height < height - 20,
        {},
        expanded!.height,
      );
      expect(await page.$eval("#state", (el) => el.textContent)).toBe(original);
      expect(
        await page.$eval(".room-onboarding-actions", (el) => el.getBoundingClientRect().bottom),
      ).toBeLessThan(550);
      expect(await page.$eval(editor, (el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const headerBottom = await page.$eval(
        ".room-reply-label",
        (el) => el.getBoundingClientRect().bottom,
      );
      const editorTop = await page.$eval(editor, (el) => el.getBoundingClientRect().top);
      expect(editorTop).toBeGreaterThanOrEqual(headerBottom);
      expect(editorTop - headerBottom).toBeLessThan(28);
      expect(await page.$eval(editor, (el) => getComputedStyle(el).resize)).toBe("none");
      await page.focus(editor);
      expect(await page.$eval(editor, (el) => getComputedStyle(el).outlineStyle)).toBe("none");
      expect(await page.$$(".room-onboarding .ant-sender-actions-list")).toHaveLength(0);
      await page.evaluate(() => {
        const next = [
          ...document.querySelectorAll<HTMLButtonElement>(".room-onboarding-actions button"),
        ].find((el) => el.textContent?.trim() === "Continue");
        if (!next) throw Error("Continue missing");
        next.click();
      });
      await page.waitForFunction(
        () => JSON.parse(document.querySelector("#state")!.textContent!).step === 1,
      );
      expect(await page.$$(".room-onboarding .ant-sender-actions-list")).toHaveLength(0);
      expect(errors).toEqual([]);
      await page.screenshot({ path: "/tmp/kiteva-top-edge-resize.png" });
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
