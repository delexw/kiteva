import { chromium } from "playwright";
import assert from "node:assert/strict";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { DEFAULT_WEB_PORT } from "../src/shared/local-web-port";
import { MotionPatternSchema } from "../src/shared/contracts";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: browserExecutablePath(),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = `http://127.0.0.1:${DEFAULT_WEB_PORT}`;
  const response = await page.request.get(`${origin}/api/motions`);
  assert.equal(response.ok(), true);
  const motions = z.array(MotionPatternSchema).parse(await response.json());
  assert.ok(motions.length > 0);
  await page.goto(`${origin}/motions`);
  await page.locator(".motion-grid .style-card").first().waitFor();
  assert.equal(await page.locator(".motion-grid .style-card").count(), motions.length);
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
  for (const { id } of motions) {
    await page.locator(`.motion-grid [data-style-id="${id}"]`).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Pause preview", exact: true }).click();
    const range = dialog.getByRole("slider", { name: "Preview time" });
    const canvas = dialog.locator("canvas");
    await range.focus();
    await range.press("Home");
    await page.waitForFunction(
      () => document.querySelector<HTMLInputElement>('[aria-label="Preview time"]')?.value === "0",
    );
    const start = await canvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    for (let step = 0; step < 70; step++) await range.press("ArrowRight");
    assert.equal(await range.inputValue(), "3.5");
    const middle = await canvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    assert.notEqual(start, middle, `${id} must have changing rendered pixels`);
    await range.press("End");
    await range.press("Home");
    for (let step = 0; step < 70; step++) await range.press("ArrowRight");
    assert.equal(
      await canvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
      middle,
      `${id} must reproduce identical pixels after seeking`,
    );
    await canvas.screenshot({ path: `.test-results/motions/${id}.png` });
    await dialog.getByRole("heading", { name: "Motion sequence", exact: true }).waitFor();
    await dialog.getByLabel("Close dialog", { exact: true }).click();
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
