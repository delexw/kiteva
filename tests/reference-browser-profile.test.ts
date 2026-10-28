import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { acquireReferenceProfile } from "../src/server/agents/capabilities/reference-browser/profile";
import { dataRoot } from "../src/server/runtime/paths";
import { browserExecutablePath } from "../src/server/runtime/browser";

it("shares a profile between stages, isolates projects and cancels queued access", async () => {
  const root = await mkdtemp(path.join(dataRoot, "runs", "profile-test-"));
  const other = await mkdtemp(path.join(os.tmpdir(), "other-profile-"));
  const signal = new AbortController().signal;
  const first = await acquireReferenceProfile(path.join(root, "preview"), signal);
  const independent = await acquireReferenceProfile(other, signal);
  const cancelled = new AbortController();
  try {
    expect(first.profile).not.toBe(independent.profile);
    expect(first.profile).toBe(path.join(root, ".runtime/browser/reference-profile"));
    const waiting = acquireReferenceProfile(path.join(root, "full"), cancelled.signal);
    cancelled.abort(Error("Project stopped"));
    await expect(waiting).rejects.toThrow("Project stopped");
    await first.release();
    const next = await acquireReferenceProfile(path.join(root, "full"), signal);
    expect(next.profile).toBe(first.profile);
    await next.release();
  } finally {
    await first.release();
    await independent.release();
    await Promise.all([root, other].map((p) => rm(p, { recursive: true, force: true })));
  }
});

it.skipIf(!browserExecutablePath(true))(
  "retains session cookies and local storage across browser restarts",
  async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "profile-storage-"));
    const signal = new AbortController().signal;
    const launch = (profile: string) =>
      puppeteer.launch({
        executablePath: browserExecutablePath(true)!,
        headless: true,
        userDataDir: profile,
      });
    let lease = await acquireReferenceProfile(workspace, signal);
    let browser = await launch(lease.profile);
    try {
      await browser.defaultBrowserContext().setCookie({
        name: "fixture_session",
        value: "signed-in",
        domain: "example.test",
        path: "/",
        httpOnly: true,
      });
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on(
        "request",
        (r) => void r.respond({ contentType: "text/html", body: "<h1>Example</h1>" }),
      );
      await page.goto("http://example.test");
      await page.evaluate(() => localStorage.setItem("fixture-login", "present"));
      await lease.save(browser);
      await browser.close();
      await lease.release();
      lease = await acquireReferenceProfile(workspace, signal);
      browser = await launch(lease.profile);
      await lease.restore(browser);
      expect(await browser.defaultBrowserContext().cookies()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "fixture_session", value: "signed-in", session: true }),
        ]),
      );
      const reopened = await browser.newPage();
      await reopened.setRequestInterception(true);
      reopened.on(
        "request",
        (r) => void r.respond({ contentType: "text/html", body: "<h1>Example</h1>" }),
      );
      await reopened.goto("http://example.test");
      expect(await reopened.evaluate(() => localStorage.getItem("fixture-login"))).toBe("present");
      if (process.platform !== "win32")
        expect(
          (await stat(path.join(workspace, ".runtime/browser/reference-cookies.json"))).mode &
            0o777,
        ).toBe(0o600);
    } finally {
      await browser.close();
      await lease.release();
      await rm(workspace, { recursive: true, force: true });
    }
  },
  30000,
);
