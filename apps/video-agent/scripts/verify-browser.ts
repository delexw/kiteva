import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { appRoot } from "../src/server/runtime/config";
const folder = path.join(appRoot, ".test-results");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.VIDEO_BROWSER_PATH,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4317");
  await page.getByRole("heading", { name: /Give your idea/ }).waitFor();
  await page.screenshot({ path: path.join(folder, "create-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: /Style explorer/ }).click();
  await page.locator(".style-card").first().waitFor();
  assert.equal(await page.locator(".style-card").count(), 115);
  const images = await page.locator(".style-card img").evaluateAll((imgs) => imgs.length);
  assert.equal(images, 115);
  await page.getByRole("textbox", { name: "Search styles" }).fill("Isometric Motion Graphics");
  assert.equal(await page.locator(".style-card").count(), 1);
  await page.locator(".style-card").click();
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("dialog").innerText(), /Three.js/);
  await page.getByRole("button", { name: "Use this style" }).click();
  await page.getByText("Primary style: Isometric Motion Graphics").waitFor();
  await page.getByRole("button", { name: /Style explorer/ }).click();
  await page.getByRole("textbox", { name: "Search styles" }).fill("");
  await page.screenshot({ path: path.join(folder, "styles-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(folder, "styles-mobile.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("button", { name: /Create workspace/ }).click();
  await page.screenshot({ path: path.join(folder, "create-mobile.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      styles: 115,
      search: true,
      metadata: true,
      pinnedStyle: true,
      mobileOverflow: false,
      pageErrors: errors,
      screenshots: folder,
    }),
  );
} finally {
  await browser.close();
}
