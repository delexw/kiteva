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
  await page.goto("http://127.0.0.1:4317");
  await page.getByRole("button", { name: /Motion explorer/ }).click();
  await page.locator(".motion-grid .style-card").first().waitFor();
  assert.equal(await page.locator(".motion-grid .style-card").count(), 16);
  await page
    .locator(".motion-grid .motion-preview")
    .first()
    .getByText("Playing · 6s motion study", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Pause previews", exact: true }).click();
  assert.equal(
    await page
      .locator(".motion-grid")
      .getByText("Playing · 6s motion study", { exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Play previews", exact: true }).click();
  await page.getByRole("textbox", { name: "Search motions" }).fill("manga");
  assert.equal(await page.locator(".motion-grid .style-card").count(), 1);
  await page.getByRole("textbox", { name: "Search motions" }).fill("");
  await mkdir(".test-results/motions", { recursive: true });
  const checked = [];
  for (let index = 1; index <= 16; index++) {
    const id = `motion-${String(index).padStart(3, "0")}`;
    await page.locator(`.motion-grid [data-style-id="${id}"]`).click();
    const dialog = page.locator("dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Pause preview", exact: true }).click();
    const range = dialog.getByRole("slider", { name: "Preview time" });
    const canvas = dialog.locator("canvas");
    await range.fill("0");
    const start = await canvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await range.fill("3.5");
    const middle = await canvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    assert.notEqual(start, middle, `${id} must have changing rendered pixels`);
    await canvas.screenshot({ path: `.test-results/motions/${id}.png` });
    await dialog.getByRole("heading", { name: "Motion sequence", exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
    checked.push(id);
  }
  await page.locator(".motion-grid .style-card").last().scrollIntoViewIfNeeded();
  await page
    .locator(".motion-grid .motion-preview")
    .first()
    .getByText("Paused · 6s motion study", { exact: true })
    .waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: /Motion explorer/ }).click();
  await page
    .locator(".motion-grid .motion-preview")
    .first()
    .getByText("Still preview · reduced motion", { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  const result = {
    previews: checked.length,
    sharedCards: true,
    search: true,
    pauseAndResume: true,
    seekableRenderedMotion: true,
    offscreenPause: true,
    reducedMotion: true,
    pageErrors: errors,
  };
  await writeFile(".test-results/motion-explorer.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
