import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { authoringSkillRoot } from "../src/server/agents/bundled-skills/installation";
import { expect, it } from "vitest";
import { anatomySkillPath, prepareBundledSkills } from "../src/server/agents/bundled-skills";
import { browserExecutablePath } from "../src/server/runtime/browser";

it.skipIf(
  !browserExecutablePath() || !existsSync(path.join(authoringSkillRoot, "anatomy/current.json")),
)(
  "builds installed SVG and 3D art offline and renders repeatable frames after seeking",
  async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "anatomy-render-"));
    const execute = promisify(execFile);
    const root = path.join(workspace, anatomySkillPath);
    let browser;
    try {
      await prepareBundledSkills(workspace, new AbortController().signal);
      await execute(process.execPath, [path.join(root, "examples/dial-indicator/build.mjs")]);
      expect(
        await readFile(path.join(root, "examples/dial-indicator/dial-indicator.html"), "utf8"),
      ).toContain("<svg");
      // Build with the real installed API, then use its synchronous controller without an idle loop.
      await execute(process.execPath, [
        "--input-type=module",
        "-e",
        `
      import * as k from ${JSON.stringify(pathToFileURL(path.join(root, "kit/iso-kit.mjs")).href)};
      import { turning } from ${JSON.stringify(pathToFileURL(path.join(root, "kit/turn-build.mjs")).href)};
      import { turnScript } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/inline-kit.mjs")).href)};
      import { writeFileSync } from 'node:fs';
      const P = k.fitProjection(k.boxCorners({x:-60,y:-60,w:120,d:120,r:0},0,60),640,400,{pad:30,azimuth:40});
      const T = turning(P);
      const dial = T.group('dial',{turn:{pivot:[0,0]}});
      const layer = T.layer('subject');
      T.stack(['subject']);
      T.prism({name:'body',group:dial,layer,plan:{x:-40,y:-16,w:80,d:32,r:2},z:0,h:40,bevel:1,material:'steel'});
      const out = T.build({statics:[],poses:[{dial:0},{dial:60},{dial:120}]});
      const body = '<style>'+out.css+'</style><div class="iso-stage iso-turn" style="width:640px;height:400px">'+out.layerSvg('subject',{width:640,height:400})+'</div>';
      const script = turnScript()+'\\nconst controller=TURN.mount(document.querySelector(".iso-stage"),'+JSON.stringify(out.data)+'); window.seek=(t)=>controller.set({dial:t*60});window.seek(0);';
      writeFileSync(${JSON.stringify(path.join(workspace, "scene.html"))},k.pageHtml({title:'Example mechanism',theme:'dark',body,script}));
    `,
      ]);
      browser = await puppeteer.launch({
        executablePath: browserExecutablePath(),
        headless: true,
        args: ["--no-sandbox", "--disable-gpu"],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      const url = pathToFileURL(path.join(workspace, "scene.html")).href;
      await page.goto(url);
      await page.waitForFunction("typeof window.seek === 'function'");
      async function frame(time: number) {
        await page.evaluate(
          (t) => (window as unknown as { seek: (time: number) => void }).seek(t),
          time,
        );
        return Buffer.from(await page.screenshot());
      }
      const first = await frame(1);
      const later = await frame(2);
      expect(first.equals(later)).toBe(false);
      expect(first.equals(await frame(1))).toBe(true);
      await frame(0);
      expect(first.equals(await frame(1))).toBe(true);
      await page.reload();
      await page.waitForFunction("typeof window.seek === 'function'");
      expect(first.equals(await frame(1))).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await browser?.close();
      await rm(workspace, { recursive: true, force: true });
    }
  },
  30_000,
);
