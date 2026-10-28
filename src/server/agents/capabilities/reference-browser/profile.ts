import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Browser, CookieData } from "puppeteer-core";
import { acquireFileLease } from "../../../runtime/file-lease";
import { prepareProjectRuntime, projectDirectory } from "../../../runtime/project-files";

/** All local build stages use the project's private profile, never the user's browser profile. */
export async function acquireReferenceProfile(workspace: string, signal: AbortSignal) {
  const files = prepareProjectRuntime(projectDirectory(workspace), "browser");
  const profile = path.join(files.root, "reference-profile");
  await mkdir(profile, { recursive: true, mode: 0o700 });
  const lease = await acquireFileLease(profile, signal);
  const cookiesFile = path.join(files.root, "reference-cookies.json");
  return {
    ...lease,
    profile,
    async restore(browser: Browser) {
      // Chromium normally discards session cookies when it closes cleanly.
      const saved = await readFile(cookiesFile, "utf8").catch((error) => {
        if (error.code === "ENOENT") return "[]";
        throw error;
      });
      const cookies = JSON.parse(saved) as CookieData[];
      if (cookies.length) await browser.defaultBrowserContext().setCookie(...cookies);
    },
    async save(browser: Browser) {
      const cookies = await browser.defaultBrowserContext().cookies();
      const temporary = `${cookiesFile}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(cookies), { mode: 0o600 });
        await rename(temporary, cookiesFile);
      } finally {
        await rm(temporary, { force: true });
      }
    },
  };
}
