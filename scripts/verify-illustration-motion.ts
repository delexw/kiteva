import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readStyleVideos } from "../src/server/catalog/style-motion";
import { stylePreviewSourceFolder } from "../src/server/catalog/style-preview-assets";
import { writeFile, mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.VIDEO_BROWSER_PATH,
});
try {
  const records = (await readStyleVideos()).filter((record) => record.reviewed);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const results = [];
  for (const record of records) {
    const errors: string[] = [];
    const listener = (error: Error) => errors.push(error.message);
    page.on("pageerror", listener);
    await page.goto(
      pathToFileURL(path.join(stylePreviewSourceFolder, record.styleId, "index.html")).href,
    );
    await page.waitForFunction(() =>
      Boolean((window as unknown as { __timelines?: unknown }).__timelines),
    );
    const result = await page.evaluate<{
      start: Array<{
        actorId: string;
        transform: string | null;
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
      end: Array<{
        actorId: string;
        transform: string | null;
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
    }>(`(() => {
   const timeline=window.__timelines.video;
   function state(){return Array.from(document.querySelectorAll('[data-demo-motion]')).map(wrapper=>{const el=wrapper.firstElementChild;const box=el.getBoundingClientRect();return {actorId:wrapper.getAttribute('data-demo-motion'),transform:el.getAttribute('transform'),x:box.x,y:box.y,width:box.width,height:box.height};});}
   timeline.seek(3,false);const start=state();
   timeline.seek(0,false);
   for(const t of [.3,.6,.9,1.2,1.5,1.8,2.1,2.4,2.7])timeline.seek(t,false);
   timeline.seek(3,false);return {start,end:state()};
  })()`);
    assert(result.start.length > 0);
    for (let i = 0; i < result.start.length; i++) {
      assert.equal(
        result.start[i].transform,
        result.end[i].transform,
        `${record.styleId} altered an authored transform`,
      );
      for (const key of ["x", "y", "width", "height"] as const)
        assert(
          Math.abs(result.start[i][key] - result.end[i][key]) < 0.25,
          `${record.styleId} ${key} failed neutral return`,
        );
    }
    assert.deepEqual(errors, [], record.styleId);
    page.off("pageerror", listener);
    results.push({
      styleId: record.styleId,
      actors: result.start.length,
      authoredTransformsPreserved: true,
      neutralReturn: true,
    });
  }
  await mkdir(".test-results", { recursive: true });
  await writeFile(".test-results/illustration-motion.json", JSON.stringify(results, null, 2));
  console.log(
    JSON.stringify({
      checked: results.length,
      authoredTransformsPreserved: true,
      neutralReturn: true,
    }),
  );
} finally {
  await browser.close();
}
