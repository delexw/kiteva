import { mkdtemp, copyFile, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { createLocalReferenceBrowser } from "../src/server/jobs/subworkflows/website-reference";

it
  .skipIf(!browserExecutablePath())
  .each(["already visible at bottom", "below fold", "nested scroll container"])(
  "centers the input before the first typed character: %s",
  async (placement) => {
    const field = `<label>Project title<input style="display:block;height:32px" onbeforeinput="measure('typing')"></label>`;
    const content =
      placement === "nested scroll container"
        ? `<section style="margin-top:80px;height:400px;overflow:auto"><div style="height:320px"></div>${field}<div style="height:1500px"></div></section>`
        : `<div style="height:${placement === "below fold" ? "1100px" : "calc(90vh - 77px)"}"></div>${field}<div style="height:1500px"></div>`;
    const web = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><style>body{margin:0}h1{margin:0;height:40px;font-size:20px}</style><h1>Form example</h1>${content}<output></output><script>
        const scrollCenters = []; let typed = false;
        document.addEventListener('scroll', () => { const box = document.querySelector('input').getBoundingClientRect(); scrollCenters.push(Math.round(box.top+box.height/2)); }, true);
        function measure(stage) { if (stage === 'typing' && typed) return; if (stage === 'typing') typed = true; const box = document.querySelector('input').getBoundingClientRect(); document.querySelector('output').textContent = 'CAPTURE_POSITION|' + JSON.stringify({ stage, top:box.top, bottom:box.bottom, center:box.top+box.height/2, viewport:innerHeight, scrollCenters, scrollportCenter: document.querySelector("section") ? document.querySelector("section").getBoundingClientRect().top + document.querySelector("section").clientHeight/2 : innerHeight/2 }) + '|'; }
        measure('initial');
      </script>`);
    });
    await new Promise<void>((resolve) => web.listen(0, "127.0.0.1", resolve));
    const address = web.address();
    if (!address || typeof address === "string") throw Error("No test server address");
    const url = `http://127.0.0.1:${address.port}`;
    const recordScroll = process.env.KITEVA_TEST_INPUT_SCROLL_CAPTURE === "1";
    const workspace = recordScroll
      ? await mkdtemp(path.join(os.tmpdir(), "input-scroll-"))
      : undefined;
    const session = await createLocalReferenceBrowser(
      [url],
      new AbortController().signal,
      "local",
      recordScroll,
    );
    const position = (text: string) =>
      JSON.parse(text.match(/CAPTURE_POSITION\|(.+?)\|/)![1]) as {
        stage: string;
        top: number;
        bottom: number;
        center: number;
        viewport: number;
        scrollCenters: number[];
        scrollportCenter: number;
      };
    try {
      const initial = await session.inspect(url);
      if (placement === "already visible at bottom") {
        const before = position(initial.text);
        expect(before.bottom).toBeLessThan(before.viewport);
        expect(before.center).toBeGreaterThan(before.viewport * 0.8);
      }
      const input = initial.controls.find((control) => control.name === "Project title");
      expect(input).toBeDefined();
      const recordingId = workspace && (await session.startRecording(workspace));
      const typed = await session.fill(input!.id, "An idea");
      const during = position(typed.text);
      expect(during.stage).toBe("typing");
      expect(new Set(during.scrollCenters).size).toBeGreaterThan(3);
      expect(during.center).toBeCloseTo(during.scrollportCenter, 0);
      expect(during.top).toBeGreaterThan(0);
      expect(during.bottom).toBeLessThan(during.viewport);
      if (recordingId && workspace) {
        await session.wait(1200);
        const recording = await session.stopRecording(recordingId);
        await copyFile(
          path.join(workspace, recording.assetPath),
          "/private/tmp/kiteva-input-smooth-scroll.webm",
        );
        if (process.env.KITEVA_SCROLL_VERIFY_DIR) {
          const directory = process.env.KITEVA_SCROLL_VERIFY_DIR;
          await mkdir(directory, { recursive: true });
          const name = placement.replaceAll(" ", "-");
          await copyFile(
            path.join(workspace, recording.assetPath),
            path.join(directory, `${name}.webm`),
          );
          await writeFile(
            path.join(directory, `${name}.json`),
            JSON.stringify(
              {
                placement,
                before: position(initial.text),
                firstTypedCharacter: during,
                recording,
              },
              null,
              2,
            ),
          );
        }
      }
    } finally {
      await session.close();
      if (workspace) await rm(workspace, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) =>
        web.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
