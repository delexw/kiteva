import { port } from "../src/server/runtime/config";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.VIDEO_BROWSER_PATH,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole("button", { name: /Style explorer/ }).click();
  await page.getByText(/model-authored one-page studies ready/).waitFor();
  await page.getByRole("textbox", { name: "Search styles" }).fill("International Typographic");
  await page.locator(".style-card").click();
  await page.getByRole("link", { name: "Open full page" }).waitFor();
  assert.match(await page.getByRole("dialog").innerText(), /claude-opus-5-5|gpt-6.1-sol/);
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Open full page" }).click();
  const study = await popup;
  await study.waitForLoadState();
  await study.locator("img").waitFor();
  await study.waitForFunction(() => {
    const image = document.querySelector("img");
    return image?.complete && image.naturalWidth === 1280;
  });
  assert.equal(await study.locator("img").count(), 1);
  await study.screenshot({ path: ".test-results/one-page-swiss.png", fullPage: true });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("textbox", { name: "Search styles" }).fill("");
  await page.screenshot({ path: ".test-results/ai-style-gallery.png", fullPage: false });
  assert.deepEqual(errors, []);
  const result = {
    fullPage: true,
    oneImage: true,
    width: 1280,
    height: 720,
    modelDisplayed: true,
    pageErrors: errors,
  };
  await writeFile(".test-results/style-pages.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
