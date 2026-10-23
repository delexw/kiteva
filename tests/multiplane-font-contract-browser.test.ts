import path from "node:path";
import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { appRoot } from "../src/server/runtime/config";
import { browserExecutablePath } from "../src/server/runtime/browser";
import {
  multiplaneContract,
  multiplaneFontExample,
} from "../src/server/rendering/multiplane/contract";

it.skipIf(!browserExecutablePath())(
  "uses the documented font tuples with the installed Multiplane runtime",
  async () => {
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath(),
      headless: "shell",
      pipe: true,
    });
    try {
      for (const fonts of [["MyFont"], multiplaneFontExample]) {
        const page = await browser.newPage();
        await page.setContent('<div id="stage" style="width:64px;height:64px"></div>');
        await page.addScriptTag({
          path: path.join(appRoot, "node_modules/multiplane/src/runtime/shot.js"),
        });
        const result = await page.evaluate(async (fonts) => {
          const runtime = window as unknown as {
            Shot: {
              define: (spec: { duration: number; fonts: unknown; render: () => void }) => void;
            };
            SHOT: { ready: Promise<void> };
          };
          runtime.Shot.define({
            duration: 1,
            fonts,
            render() {
              document.querySelector("#stage")!.textContent = "Ready";
            },
          });
          try {
            await runtime.SHOT.ready;
            return { ready: true, text: document.querySelector("#stage")!.textContent };
          } catch (error) {
            return { ready: false, error: String(error) };
          }
        }, fonts);
        if (fonts === multiplaneFontExample) expect(result).toEqual({ ready: true, text: "Ready" });
        else {
          expect(result.ready).toBe(false);
          expect(result.error).toContain("font");
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }
    for (const kind of ["preview", "full"] as const) {
      const prompt = multiplaneContract({ width: 1280, height: 720, duration: 3, fps: 60, kind });
      expect(prompt).toContain(`fonts: ${JSON.stringify(multiplaneFontExample)}`);
      expect(prompt).toContain("node_modules/multiplane/skills/multiplane/SKILL.md");
      expect(prompt).toContain("BEFORE setup()");
      expect(prompt).toContain("--no-lint");
    }
  },
  30000,
);
