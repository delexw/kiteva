import { port } from "../src/server/runtime/config";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.VIDEO_BROWSER_PATH,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  const suggestions = page.locator(".inspiration-grid .style-card--compact");
  await suggestions.first().waitFor();
  assert.equal(await suggestions.count(), 3);
  assert.equal(await suggestions.first().locator(".style-image .example-media").count(), 1);
  assert.equal(await suggestions.first().locator(".style-category").count(), 0);
  const suggestionBounds = await suggestions.first().evaluate((card) => {
    const bounds = card.getBoundingClientRect();
    const image = card.querySelector(".style-image")!.getBoundingClientRect();
    return { inset: image.left - bounds.left, width: image.width, cardWidth: bounds.width };
  });
  assert(
    suggestionBounds.inset <= 2 && suggestionBounds.cardWidth - suggestionBounds.width <= 4,
    "Suggestion image must use the shared edge-to-edge card layout",
  );
  await page.getByRole("button", { name: /Style explorer/ }).click();
  await page.getByRole("textbox", { name: "Search styles" }).fill("Pop Art");
  const card = page.locator(".style-card").first();
  const video = card.locator("video");
  await video.waitFor();
  // Visible cards must play without hover.
  await page.mouse.move(0, 0);
  await video.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const v = document.querySelector(".style-card video") as HTMLVideoElement;
    return v && v.currentTime > 0.2 && !v.paused;
  });
  const duration = await video.evaluate((el: HTMLVideoElement) => el.duration);
  assert.equal(duration, 3);
  const response = await page.request.get(`http://127.0.0.1:${port}/api/examples/style-011/video`, {
    headers: { Range: "bytes=0-1000" },
  });
  assert.equal(response.status(), 206);
  await page.getByRole("button", { name: "Pause demos", exact: true }).click();
  await page.waitForFunction(
    () => (document.querySelector(".style-card video") as HTMLVideoElement)?.paused,
  );
  await page.getByRole("button", { name: "Play demos", exact: true }).click();
  await card.focus();
  await page.waitForFunction(() => {
    const v = document.querySelector(".style-card video") as HTMLVideoElement;
    return v && v.currentTime > 0.1 && !v.paused;
  });
  // Retained keyboard focus must not keep an offscreen card playing.
  await page.getByRole("textbox", { name: "Search styles" }).fill("");
  await page
    .locator(".style-card h3")
    .first()
    .evaluate((heading) => {
      heading.textContent = "A deliberately long style title that wraps across several lines";
    });
  const imageTops = await page
    .locator(".style-card .style-image")
    .evaluateAll((images) => images.slice(0, 3).map((image) => image.getBoundingClientRect().top));
  assert(
    Math.max(...imageTops) - Math.min(...imageTops) < 1,
    "Wrapped card names must not shift image tops",
  );
  await page.locator(".style-card").last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".style-card video")).every((element) => {
      const v = element as HTMLVideoElement;
      const box = v.getBoundingClientRect();
      const offscreen = box.bottom <= 0 || box.top >= window.innerHeight;
      return !offscreen || v.paused;
    }),
  );
  const currentVideos = await page.locator(".style-card video").evaluateAll((elements) =>
    elements.map((element) => {
      const v = element as HTMLVideoElement;
      const box = v.getBoundingClientRect();
      return { visible: box.bottom > 0 && box.top < window.innerHeight, paused: v.paused };
    }),
  );
  assert(
    currentVideos.some((v) => !v.visible && v.paused),
    "Offscreen demos must pause",
  );
  const readyCard = page
    .locator(".style-card")
    .filter({ has: page.locator("video") })
    .last();
  await readyCard.scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".style-card video")).some((element) => {
      const v = element as HTMLVideoElement;
      const box = v.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight && !v.paused && v.currentTime > 0.1;
    }),
  );
  await page.getByRole("textbox", { name: "Search styles" }).fill("Manga");
  await page.locator(".style-card").first().click();
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => {
    const video = document.querySelector("dialog .style-detail video") as HTMLVideoElement;
    return video && !video.paused && video.currentTime > 0.2;
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await mkdir(".test-results", { recursive: true });
  await page.screenshot({ path: ".test-results/claude-motion-card.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: /Style explorer/ }).click();
  await page.getByRole("textbox", { name: "Search styles" }).fill("Pop Art");
  await card.locator("img").waitFor();
  assert.equal(await card.locator("video").count(), 0);
  const records = (await (await page.request.get(`http://127.0.0.1:${port}/api/examples`)).json())
    .examples;
  assert(
    records
      .filter((r: { source?: string }) => r.source)
      .every((r: { provider: string }) => r.provider === "claude"),
  );
  assert.deepEqual(errors, []);
  const result = {
    duration,
    visibleAutoplay: true,
    sharedCompactAndExplorerCards: true,
    wrappedTitleImagesTopAligned: true,
    styleDialogAutoplayWithoutHover: true,
    globalPauseAndResume: true,
    scrollPlaybackAndOffscreenPause: true,
    keyboardPlayback: true,
    rangeStreaming: true,
    reducedMotionPoster: true,
    noPublishedGPT: true,
    pageErrors: errors,
  };
  await writeFile(".test-results/style-videos.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
