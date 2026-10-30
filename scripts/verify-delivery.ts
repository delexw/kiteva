import { port } from "../src/server/runtime/config";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
const base = `http://127.0.0.1:${port}`;
const runs = await (await fetch(`${base}/api/runs`)).json();
const run = runs.find((r: { jobs: Array<{ kind: string; phase: string }> }) =>
  r.jobs.some((j) => j.kind === "full" && j.phase === "ready"),
);
assert.ok(run, "A real completed full video is required");
async function firstEvent(after = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${base}/api/runs/${run.id}/events?after=${after}`, {
      signal: controller.signal,
    });
    assert.match(response.headers.get("content-type") || "", /event-stream/);
    const reader = response.body!.getReader();
    let text = "";
    while (!text.includes("\n\n")) {
      const value = await reader.read();
      assert.equal(value.done, false);
      text += new TextDecoder().decode(value.value);
    }
    const id = Number(text.match(/^id: (\d+)/m)?.[1]);
    await reader.cancel();
    return id;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
const first = await firstEvent();
assert.ok((await firstEvent(first)) > first, "SSE cursor resumes after the previous event");
const job = run.jobs.find(
  (j: { kind: string; phase: string }) => j.kind === "full" && j.phase === "ready",
);
const zip = await fetch(`${base}/api/projects/${run.id}/${job.id}`);
assert.equal(zip.status, 200);
const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
assert.ok(files["index.html"] && files["STORYBOARD.json"]);
assert.ok(!Object.keys(files).some((f) => /node_modules|\.codex|auth\.json/.test(f)));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.VIDEO_BROWSER_PATH,
});
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  await page.goto(base);
  await page.getByRole("button", { name: /Recent projects/ }).click();
  await page.locator(".history-list button").first().waitFor();
  await page
    .locator(".history-list button")
    .filter({ hasText: run.brief.subject })
    .filter({ hasText: run.request.provider })
    .click();
  await page.locator("video").first().waitFor();
  if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape");
  const video = page.locator(`video[src*="/${job.id}/"]`).first();
  await video.evaluate(async (v) => {
    const el = v as HTMLVideoElement;
    el.muted = true;
    await el.play();
  });
  await page.waitForFunction(
    (id) =>
      Array.from(document.querySelectorAll("video")).some(
        (v) => v.src.includes(`/${id}/`) && v.currentTime > 0,
      ),
    job.id,
  );
  await page
    .getByRole("button", { name: /Compare/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.getByRole("button", { name: /Restart together/ }).click();
  await page.getByLabel("Full video duration", { exact: true }).selectOption("custom");
  await page.getByLabel("Duration in seconds", { exact: true }).fill("15");
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0);
  console.log(
    JSON.stringify({
      sseReconnect: true,
      sourceDownload: true,
      decodedPlayback: true,
      comparison: true,
      durationSelection: true,
      keyboardDialog: true,
      reducedMotion: true,
    }),
  );
} finally {
  await browser.close();
}
