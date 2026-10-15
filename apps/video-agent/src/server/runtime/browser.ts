import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
export function browserExecutablePath() {
  const browserCache = path.join(
    process.env.HOME || "",
    ".cache",
    "puppeteer",
    "chrome-headless-shell",
  );
  const cachedBrowser = existsSync(browserCache)
    ? readdirSync(browserCache, { recursive: true })
        .map(String)
        .filter((p) => p.endsWith("/chrome-headless-shell"))
        .sort()
        .at(-1)
    : undefined;
  return (
    process.env.HYPERFRAMES_BROWSER_PATH ||
    process.env.VIDEO_BROWSER_PATH ||
    (cachedBrowser ? path.join(browserCache, cachedBrowser) : undefined)
  );
}
