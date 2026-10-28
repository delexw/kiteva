import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/server/rendering/multiplane/cache", async (load) => ({
  ...(await load<typeof import("../src/server/rendering/multiplane/cache")>()),
  installedRuntimeFingerprint: async () => "fixture-runtime",
}));
import { createMultiplaneRecoveryCache } from "../src/server/rendering/multiplane/recovery-cache";
import type { reviewRenderCache } from "../src/server/jev/strategies/render-cache";
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function fixture(count = 2) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "cache-review-"));
  roots.push(workspace);
  await mkdir(path.join(workspace, "renders"));
  for (let i = 0; i < count; i++)
    await writeFile(
      path.join(workspace, `shot-${i}.html`),
      `<script>const image=new Image();</script><p>Shot ${i}</p>`,
    );
  const signal = AbortSignal.timeout(60000),
    onEvent = vi.fn();
  const review = vi.fn(async () => true) as unknown as ReturnType<
    typeof vi.fn<typeof reviewRenderCache>
  >;
  const session = () => createMultiplaneRecoveryCache({ workspace, signal, onEvent, review });
  const output = (i: number) => path.join(workspace, `renders/part-${i}.webm`);
  const settings = { fps: 30, duration: 1, width: 320, height: 180, kind: "full" };
  return { workspace, signal, onEvent, review, session, output, settings };
}

it("reuses all 49 accepted shots after a failure at 98 percent and renders only the unfinished shot", async () => {
  const f = await fixture(50);
  let cache = (await f.session())!;
  for (let i = 0; i < 49; i++) {
    await writeFile(f.output(i), `validated-shot-${i}`);
    await cache.store(`shot-${i}.html`, f.settings, f.output(i));
  }
  // Shot 50 failed verification: no checkpoint is written for it.
  await writeFile(path.join(f.workspace, "shot-49.html"), "<p>Corrected final shot</p>");
  cache = (await f.session())!;
  let reused = 0;
  for (let i = 0; i < 50; i++) {
    if (i < 49) await rm(f.output(i));
    if (await cache.restore(`shot-${i}.html`, f.settings, f.output(i))) reused++;
  }
  expect(reused).toBe(49);
  expect(f.review).toHaveBeenCalledTimes(49);
  expect(await readFile(f.output(0), "utf8")).toBe("validated-shot-0");
}, 60000);

it("restores unchanged dynamic-resource shots across sessions without JEV and ignores private runtime files", async () => {
  const f = await fixture();
  let cache = (await f.session())!;
  await writeFile(f.output(0), "accepted");
  await cache.store("shot-0.html", f.settings, f.output(0));
  await mkdir(path.join(f.workspace, ".runtime"));
  await writeFile(path.join(f.workspace, ".runtime", "login"), "private");
  cache = (await f.session())!;
  await rm(f.output(0));
  expect(await cache.restore("shot-0.html", f.settings, f.output(0))).toBe(true);
  expect(f.review).not.toHaveBeenCalled();
});

it("ignores nested tool homes, temporary files and logs without ignoring footage inputs", async () => {
  const f = await fixture();
  let cache = (await f.session())!;
  await writeFile(f.output(0), "accepted");
  await cache.store("shot-0.html", f.settings, f.output(0));
  const privateFolder = path.join(f.workspace, "audio", ".runtime", "tools", "home");
  await mkdir(privateFolder, { recursive: true });
  await writeFile(path.join(privateFolder, "browser-profile.log"), "private runtime state");
  cache = (await f.session())!;
  expect(await cache.restore("shot-0.html", f.settings, f.output(0))).toBe(true);
  expect(f.review).not.toHaveBeenCalled();
  await mkdir(path.join(f.workspace, "frames"));
  await writeFile(path.join(f.workspace, "frames", "0001.jpg"), "changed footage");
  cache = (await f.session())!;
  await cache.restore("shot-0.html", f.settings, f.output(0));
  expect(f.review).toHaveBeenCalledOnce();
  expect(f.review.mock.calls[0][0].state).toMatchObject({ changes: [{ file: "frames/0001.jpg" }] });
});

it("reuses a complete unchanged dependency graph without calling a model for unrelated edits", async () => {
  const f = await fixture();
  await writeFile(path.join(f.workspace, "shot-0.html"), "<p>Static shot</p>");
  let cache = (await f.session())!;
  await writeFile(f.output(0), "accepted static shot");
  await cache.store("shot-0.html", f.settings, f.output(0));
  await writeFile(path.join(f.workspace, "shot-1.html"), "<p>Changed another shot</p>");
  cache = (await f.session())!;
  expect(await cache.restore("shot-0.html", f.settings, f.output(0))).toBe(true);
  expect(f.review).not.toHaveBeenCalled();
  await writeFile(path.join(f.workspace, "shot-0.html"), "<p>Changed target</p>");
  cache = (await f.session())!;
  await cache.restore("shot-0.html", f.settings, f.output(0));
  expect(f.review).toHaveBeenCalledOnce();
});

it("honors refresh and refuses corrupt bytes, changed render settings and cancellation", async () => {
  const f = await fixture();
  let cache = (await f.session())!;
  await writeFile(f.output(0), "accepted");
  await cache.store("shot-0.html", f.settings, f.output(0));
  await writeFile(path.join(f.workspace, "shot-1.html"), "<p>Changed</p>");
  cache = (await f.session())!;
  f.review.mockResolvedValueOnce(false);
  expect(await cache.restore("shot-0.html", f.settings, f.output(0))).toBe(false);
  expect(await cache.restore("shot-0.html", { ...f.settings, fps: 60 }, f.output(0))).toBe(false);
  const directory = path.join(f.workspace, "renders/multiplane-cache");
  const file = (await readdir(directory)).find((p) => p.endsWith(".video"))!;
  await writeFile(path.join(directory, file), "corrupted");
  expect(await cache.restore("shot-0.html", f.settings, f.output(0))).toBe(false);
  await writeFile(path.join(f.workspace, "large.html"), "<p>" + "x".repeat(50000) + "</p>");
  await writeFile(path.join(f.workspace, "another-large.html"), "y".repeat(50000));
  cache = (await f.session())!;
  f.review.mockClear();
  expect(await cache.restore("shot-0.html", f.settings, f.output(0))).toBe(false);
  expect(f.review).toHaveBeenCalledOnce();
  await expect(
    createMultiplaneRecoveryCache({ ...f, signal: AbortSignal.abort(Error("Stopped")) }),
  ).rejects.toThrow("Stopped");
});
it("passes oversized evidence to the brief-and-review pipeline instead of forcing a rebuild", async () => {
  const f = await fixture();
  let cache = (await f.session())!;
  await writeFile(f.output(0), "accepted");
  await cache.store("shot-0.html", f.settings, f.output(0));
  await writeFile(path.join(f.workspace, "large.html"), "x".repeat(24000));
  await writeFile(path.join(f.workspace, "another.html"), "y".repeat(24000));
  cache = (await f.session())!;
  expect(await cache.restore("shot-0.html", f.settings, f.output(0))).toBe(true);
  expect(f.review).toHaveBeenCalledOnce();
  expect(Buffer.byteLength(JSON.stringify(f.review.mock.calls[0][0].state))).toBeGreaterThan(28000);
});

it("does not checkpoint inputs edited while rendering and invalidates changed renderer environment", async () => {
  const f = await fixture();
  const cache = (await f.session())!;
  await writeFile(f.output(0), "accepted");
  await writeFile(path.join(f.workspace, "shot-0.html"), "<p>Edited during render</p>");
  await cache.store("shot-0.html", f.settings, f.output(0));
  expect(await (await f.session())!.restore("shot-0.html", f.settings, f.output(0))).toBe(false);
  const stable = (await f.session())!;
  await stable.store("shot-0.html", f.settings, f.output(0));
  vi.stubEnv("MULTIPLANE_TEST_RUNTIME", "changed");
  expect(await (await f.session())!.restore("shot-0.html", f.settings, f.output(0))).toBe(false);
});

it("removes the previous input pointer before a replacement render is interrupted", async () => {
  const f = await fixture();
  let cache = (await f.session())!;
  await writeFile(f.output(0), "first accepted bytes");
  await cache.store("shot-0.html", f.settings, f.output(0));
  const original = await readFile(path.join(f.workspace, "shot-0.html"), "utf8");
  await writeFile(path.join(f.workspace, "shot-0.html"), "<p>Second version</p>");
  cache = (await f.session())!;
  await writeFile(path.join(f.workspace, "shot-0.html"), "<p>Changed during replacement</p>");
  await writeFile(f.output(0), "replacement bytes");
  await cache.store("shot-0.html", f.settings, f.output(0));
  await writeFile(path.join(f.workspace, "shot-0.html"), original);
  cache = (await f.session())!;
  expect(await cache.restore("shot-0.html", f.settings, f.output(0))).toBe(false);
});
