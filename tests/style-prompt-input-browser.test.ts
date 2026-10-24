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
  "inserts, edits, saves and restores native Ant Design X style mentions",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "style-mention-"));
    const server = await createServer({
      configFile: false,
      cacheDir,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.data/**"] } },
      plugins: [
        react(),
        {
          name: "style-mention-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/style-mention-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `<!doctype html><style>output { display: none; }</style><div id="root"></div><script type="module">
import '/src/client/style.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{StylePromptInput}from'/src/client/components/style-prompt-input.tsx';
import{MotionMentionsContext}from'/src/client/components/style-picker.tsx';
const styles=[{id:'style-140',name_en:'Vintage Rubber Hose Animation'},{id:'style-136',name_en:'Manga Production Theatre'},{id:'style-056',name_en:'Mosaic'}];
function App(){const[value,setValue]=useState('Act 1: ');const[saved,setSaved]=useState('');const[version,setVersion]=useState(0);const[submitted,setSubmitted]=useState('');return React.createElement(React.Fragment,null,
React.createElement(MotionMentionsContext,{value:[{id:'motion-036',name_en:'Glitch Type Build'}]},React.createElement(StylePromptInput,{key:version,'aria-label':'Idea',value,onChange:setValue,styles,onSubmit:setSubmitted})),
React.createElement('button',{id:'save',onClick:()=>setSaved(value)},'Save'),
React.createElement('button',{id:'restore',onClick:()=>{setValue(saved);setVersion(v=>v+1)}},'Restore'),
React.createElement('button',{id:'external',onClick:()=>setValue('External <style id="style-136">Manga Production Theatre</style> end')},'External update'),
React.createElement('button',{id:'reset',onClick:()=>{setValue('Act 1: ');setVersion(v=>v+1)}},'Reset'),
React.createElement('button',{id:'colors',onClick:()=>setValue('Palette #87E64B and #FFF5ED')},'Color palette'),
React.createElement('output',{id:'state'},value),React.createElement('output',{id:'saved'},saved),React.createElement('output',{id:'submitted'},submitted));}
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
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`${server.resolvedUrls!.local[0]}style-mention-test`);
      const editor = '[contenteditable="true"][role="textbox"]';
      await page.waitForSelector(editor);
      await page.click("#colors");
      await page.waitForFunction(
        () => document.querySelectorAll(".prompt-color-chip").length === 2,
      );
      const swatch = await page.$eval(".prompt-color-swatch", (el) => ({
        color: getComputedStyle(el).backgroundColor,
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
      }));
      expect(swatch.color).toBe("rgb(135, 230, 75)");
      expect(swatch.width).toBeGreaterThan(swatch.height);
      await page.click("button.prompt-color-chip");
      await page.waitForSelector(".ant-color-picker-panel", { visible: true });
      await page.screenshot({ path: "/tmp/kiteva-color-picker.png" });
      await page.waitForSelector(".ant-color-picker-hex-input input", { visible: true });
      await page.focus(".ant-color-picker-hex-input input");
      await page.keyboard.press("Home");
      await page.keyboard.down("Shift");
      await page.keyboard.press("End");
      await page.keyboard.up("Shift");
      await page.keyboard.type("123456");
      await page.screenshot({ path: "/tmp/kiteva-color-picker-edited.png" });
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => document.querySelector("#state")?.textContent === "Palette #123456 and #FFF5ED",
      );
      await page.click("#save");
      await page.click("#restore");
      await page.waitForFunction(
        () => document.querySelectorAll(".prompt-color-chip").length === 2,
      );
      expect(await page.$eval("#state", (el) => el.textContent)).toBe(
        "Palette #123456 and #FFF5ED",
      );
      await page.screenshot({ path: "/tmp/kiteva-color-chips.png" });
      await page.click("#reset");
      const initialBox = await (await page.$(editor))!.boundingBox();
      expect(initialBox).not.toBeNull();
      expect(await page.$eval(editor, (el) => getComputedStyle(el).resize)).toBe("vertical");
      // Drag the browser's native resize handle; no custom pointer handlers are involved.
      await page.mouse.move(
        initialBox!.x + initialBox!.width - 3,
        initialBox!.y + initialBox!.height - 3,
      );
      await page.mouse.down();
      await page.mouse.move(
        initialBox!.x + initialBox!.width - 3,
        initialBox!.y + initialBox!.height + 87,
        { steps: 10 },
      );
      await page.mouse.up();
      const expandedBox = await (await page.$(editor))!.boundingBox();
      expect(expandedBox!.height).toBeGreaterThan(initialBox!.height + 50);
      expect(expandedBox!.width).toBeCloseTo(initialBox!.width, 0);
      await page.focus(editor);
      await page.keyboard.press("End");
      await page.keyboard.type("@rubber");
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[role="menuitemcheckbox"]')].some((el) =>
          el.textContent?.includes("Vintage Rubber Hose"),
        ),
      );
      expect(await page.$eval(".style-picker-option img", (el) => el.getAttribute("src"))).toBe(
        "/api/examples/style-140",
      );
      expect(await page.$eval(".style-picker-option", (el) => el.textContent)).toContain(
        "Vintage Rubber Hose Animation",
      );
      const popupWidth = await page.$eval(
        ".style-prompt-suggestions",
        (el) => el.getBoundingClientRect().width,
      );
      const rowWidth = await page.$eval(
        '.style-prompt-suggestions [role="menuitemcheckbox"]',
        (el) => el.getBoundingClientRect().width,
      );
      expect(rowWidth).toBeGreaterThan(popupWidth - 32);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.waitForSelector(".style-prompt-mention");
      await page.waitForFunction(() =>
        document.querySelector("#state")?.textContent?.includes('<style id="style-140">'),
      );
      await page.keyboard.type("opener.");
      await page.keyboard.down("Shift");
      await page.keyboard.press("Enter");
      await page.keyboard.up("Shift");
      await page.keyboard.type("Act 3: ");
      // Repeated lookup by ID, with a mouse selection this time.
      await page.keyboard.type("@style-136");
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[role="menuitemcheckbox"]')].some((el) =>
          el.textContent?.includes("Manga Production Theatre"),
        ),
      );
      const itemHandle = await page.evaluateHandle(() =>
        [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find((el) =>
          el.textContent?.includes("Manga Production Theatre"),
        )!,
      );
      const option = await itemHandle.asElement()!.toElement("li");
      await option.click();
      await page.waitForFunction(() =>
        document.querySelector("#state")?.textContent?.includes('<style id="style-136">'),
      );
      await page.keyboard.type("ending.");
      const xml = await page.$eval("#state", (el) => el.textContent!);
      expect(xml).toContain('<style id="style-140">Vintage Rubber Hose Animation</style>');
      expect(xml).toContain('<style id="style-136">Manga Production Theatre</style>');
      expect(xml).not.toContain("@rubber");
      expect(xml).toContain("opener.");
      expect(xml).toContain("ending.");
      await (await page.$(".style-prompt-input"))!.screenshot({
        path: "/tmp/kiteva-style-mentions.png",
      });
      await page.click("#save");
      await page.click("#restore");
      await page.waitForFunction(
        () => document.querySelectorAll(".style-prompt-mention").length === 2,
      );
      expect(await page.$eval("#state", (el) => el.textContent)).toBe(xml);
      await page.focus(editor);
      await page.keyboard.press("End");
      await page.keyboard.type(" @does-not-exist");
      await page.waitForFunction(() =>
        document.body.textContent?.includes("No matching Motion Graphics"),
      );
      await page.keyboard.press("Escape");
      await page.click("#restore");
      await page.focus(editor);
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => Boolean(document.querySelector("#submitted")?.textContent));
      expect(await page.$eval("#submitted", (el) => el.textContent)).toBe(xml);
      // External draft changes must rebuild chips, not retain the previous document.
      await page.click("#external");
      await page.waitForFunction(
        () => document.querySelectorAll(".style-prompt-mention").length === 1,
      );
      expect(await page.$eval(editor, (el) => el.textContent)).toContain("External");
      expect(await page.$eval("#state", (el) => el.textContent)).toBe(
        'External <style id="style-136">Manga Production Theatre</style> end',
      );
      // Insert in the middle of the idea without losing its existing mention or suffix.
      await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('[role="textbox"]')!;
        root.focus();
        const range = document.createRange();
        range.setStart(root.firstChild!, "External ".length);
        range.collapse(true);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
      });
      await page.keyboard.type("@style-140");
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[role="menuitemcheckbox"]')].some((el) =>
          el.textContent?.includes("Vintage Rubber Hose"),
        ),
      );
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        document.querySelector("#state")?.textContent?.includes('<style id="style-140">'),
      );
      expect(await page.$eval("#state", (el) => el.textContent)).toBe(
        'External <style id="style-140">Vintage Rubber Hose Animation</style> <style id="style-136">Manga Production Theatre</style> end',
      );
      // Native Backspace removes a mention atomically, keeping the neighbouring text.
      await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('[role="textbox"]')!;
        const tag = root.querySelector('[contenteditable="false"]')!;
        const range = document.createRange();
        range.setStart(tag.nextSibling!, 0);
        range.collapse(true);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
      });
      await page.keyboard.press("Backspace");
      await page.waitForFunction(
        () => !document.querySelector("#state")?.textContent?.includes('<style id="style-140">'),
      );
      expect(await page.$eval("#state", (el) => el.textContent)).toContain(
        '<style id="style-136">Manga Production Theatre</style> end',
      );
      // Paste the same XML twice; each native slot must keep its own key and value.
      for (let index = 0; index < 2; index++) {
        await page.evaluate(() => {
          const root = document.querySelector<HTMLElement>('[role="textbox"]')!;
          root.focus();
          const range = document.createRange();
          range.selectNodeContents(root);
          range.collapse(false);
          window.getSelection()!.removeAllRanges();
          window.getSelection()!.addRange(range);
          const clipboard = new DataTransfer();
          clipboard.setData(
            "text/plain",
            '<style id="style-140">Vintage Rubber Hose Animation</style>',
          );
          root.dispatchEvent(
            new ClipboardEvent("paste", {
              bubbles: true,
              cancelable: true,
              clipboardData: clipboard,
            }),
          );
        });
        await page.waitForFunction(
          (count) =>
            (document.querySelector("#state")?.textContent?.match(/<style id="style-140">/g) || [])
              .length === count,
          {},
          index + 1,
        );
      }
      const pasted = await page.$eval("#state", (el) => el.textContent!);
      expect(pasted.match(/<style id="style-140">/g)).toHaveLength(2);
      expect(pasted).toContain('<style id="style-136">Manga Production Theatre</style> end');
      await page.focus(editor);
      await page.keyboard.down("Control");
      await page.keyboard.press("End");
      await page.keyboard.up("Control");
      await page.keyboard.type(" @glitch");
      await page.waitForSelector('.style-picker-option[data-preview-variant="motion"] canvas');
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        document
          .querySelector("#state")
          ?.textContent?.includes('<motion id="motion-036">Glitch Type Build</motion>'),
      );
      const motionChip = '.style-prompt-mention[data-mention-variant="motion"]';
      await page.hover(motionChip);
      await page.waitForSelector('.style-mention-preview [data-motion-id="motion-036"]', {
        visible: true,
      });
      await page.waitForFunction(() => {
        const popup = document.querySelector(".style-mention-preview");
        const media = popup?.querySelector("canvas");
        return (
          popup &&
          media &&
          media.getBoundingClientRect().width > 100 &&
          media.getBoundingClientRect().height > 100 &&
          media.getBoundingClientRect().width <= popup.getBoundingClientRect().width + 1 &&
          getComputedStyle(popup.closest(".ant-popover")!).opacity === "1" &&
          popup.textContent?.includes("Playing")
        );
      });
      await page.screenshot({ path: "/tmp/kiteva-motion-mention-preview.png" });
      const mixed = await page.$eval("#state", (el) => el.textContent);
      await page.click("#save");
      await page.click("#restore");
      await page.waitForSelector(motionChip);
      expect(await page.$eval("#state", (el) => el.textContent)).toBe(mixed);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60_000,
);
