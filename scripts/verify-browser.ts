import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { appRoot } from "../src/server/runtime/config";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { RoomStateSchema, RoomPatchSchema, applyRoomPatch } from "../src/shared/room";
import { loadCatalog } from "../src/server/catalog/catalog";

const folder = path.join(appRoot, ".test-results");
await mkdir(folder, { recursive: true });
const catalog = await loadCatalog();
const selected = catalog.styles.find((style) => style.name_en === "Isometric Motion Graphics")!;
assert.ok(selected, "Catalog includes the smoke-test reference style");
const browser = await chromium.launch({ headless: true, executablePath: browserExecutablePath() });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  // Isolate room preferences while checking the real app and catalog APIs.
  // A saved maximized window must not cover the smoke-test target or be overwritten.
  let room = RoomStateSchema.parse({});
  await page.route("**/api/room", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: room });
    } else if (route.request().method() === "PATCH") {
      const response = applyRoomPatch(room, RoomPatchSchema.parse(route.request().postDataJSON()));
      room = response.state;
      await route.fulfill({ json: response });
    } else await route.abort();
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4317/");
  await page.locator(".creative-room").waitFor();
  await page.screenshot({ path: path.join(folder, "create-desktop.png"), fullPage: true });
  await page.goto("http://127.0.0.1:4317/styles");
  await page.locator(".style-card").first().waitFor();
  assert.equal(await page.locator(".style-card").count(), catalog.styles.length);
  const search = page.getByRole("textbox", { name: "Search Motion Graphics", exact: true });
  await search.fill(selected.name_en);
  const card = page.locator(`.style-card[data-style-id="${selected.id}"]`);
  await card.waitFor();
  assert.ok((await page.locator(".style-card").count()) < catalog.styles.length);
  await card.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /Three\.js/);
  // Read-only smoke: do not select a style or change the user's project/draft.
  await page.goto("http://127.0.0.1:4317/styles");
  await page.locator(".style-card").first().waitFor();
  await page.screenshot({ path: path.join(folder, "styles-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(folder, "styles-mobile.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.goto("http://127.0.0.1:4317/");
  await page.locator(".creative-room").waitFor();
  await page.screenshot({ path: path.join(folder, "create-mobile.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      styles: catalog.styles.length,
      search: true,
      metadata: true,
      mobileOverflow: false,
      pageErrors: errors,
      screenshots: folder,
    }),
  );
} finally {
  await browser.close();
}
