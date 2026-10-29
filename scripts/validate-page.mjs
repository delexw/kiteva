import { workspaceFolders } from "../src/shared/workspace.ts";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const workspace = await realpath(process.argv[2]);
const outputWorkspace = await realpath(process.argv[3] || process.argv[2]);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = await realpath(
      path.resolve(workspace, "." + (pathname === "/" ? "/index.html" : pathname)),
    );
    if (
      !file.startsWith(workspace + path.sep) ||
      file.includes(path.sep + "node_modules" + path.sep)
    )
      throw Error("Outside page workspace");
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.HYPERFRAMES_BROWSER_PATH || undefined,
    headless: true,
  });
  const context = await browser.newContext();
  const failures = [];
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("requestfailed", (request) => failures.push(`Resource failed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(`Resource ${response.status()}: ${response.url()}`);
  });
  const checks = [];
  await mkdir(path.join(outputWorkspace, workspaceFolders.renders), { recursive: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(origin, { waitUntil: "networkidle" });
    const layout = await page.evaluate(() => ({
      content: document.body.innerText.trim().length,
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      title: document.title,
    }));
    if (layout.content < 8) failures.push("Page has no readable content");
    if (layout.overflow) failures.push(`Horizontal overflow at ${width}px`);
    if (
      !(await page.evaluate(() => document.documentElement.dataset.kitevaMotionRuntime === "ready"))
    )
      failures.push(
        "Missing built-in motion runtime: include ./motion-runtime.js before animation setup",
      );
    const targets = page.locator("[data-motion-mode]");
    for (let index = 0; index < (await targets.count()); index++) {
      await targets.nth(index).scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
      const lifecycle = await page.evaluate(() => {
        const targets = [...document.querySelectorAll("[data-motion-mode]")];
        return targets.map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            mode: element.dataset.motionMode,
            offscreen: bounds.bottom <= 0 || bounds.top >= innerHeight,
            active: element.dataset.motionActive,
            running: element
              .getAnimations({ subtree: true })
              .some((animation) => animation.playState === "running"),
          };
        });
      });
      if (
        lifecycle.some(
          (target) =>
            target.offscreen &&
            (target.active === "true" ||
              (["ambient", "entrance"].includes(target.mode) && target.running)),
        )
      )
        failures.push("Offscreen motion is still running");
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(80);
    const reducedMotion = await page.evaluate(() =>
      [...document.querySelectorAll("[data-motion-mode]")].every(
        (element) =>
          element.dataset.motionActive === "false" &&
          (!["ambient", "entrance"].includes(element.dataset.motionMode) ||
            element
              .getAnimations({ subtree: true })
              .every((animation) => animation.playState !== "running")),
      ),
    );
    if (!reducedMotion) failures.push("Motion does not stop for reduced-motion preference");
    // Catch unmanaged CSS/WAAPI animation, including motion omitted from registration.
    if (
      await page.evaluate(() =>
        document.getAnimations().some((animation) => animation.playState === "running"),
      )
    )
      failures.push(
        "Unmanaged animation runs under reduced motion; register it or provide a reduced-motion still",
      );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => scrollTo(0, 0));
    checks.push({ width, ...layout, motionTargets: await targets.count(), reducedMotion });
    await page.screenshot({
      path: path.join(
        outputWorkspace,
        workspaceFolders.renders,
        width === 1280 ? "page.png" : "page-mobile.png",
      ),
    });
  }
  if (failures.length) throw Error([...new Set(failures)].join("\n"));
  await writeFile(
    path.join(outputWorkspace, workspaceFolders.renders, "page-validation.json"),
    JSON.stringify({ passed: true, checks, verifiedAt: new Date().toISOString() }, null, 2),
  );
  console.log("Page loads at desktop and mobile widths; no browser errors or failed resources.");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
