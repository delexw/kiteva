import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { userHome } from "./platform";

export function browserExecutablePath(desktop = false) {
  const configured = desktop
    ? process.env.VIDEO_BROWSER_PATH || process.env.HYPERFRAMES_BROWSER_PATH
    : process.env.HYPERFRAMES_BROWSER_PATH || process.env.VIDEO_BROWSER_PATH;
  if (configured) return desktop && /headless-shell/i.test(configured) ? undefined : configured;
  const cache = process.env.PUPPETEER_CACHE_DIR || path.join(userHome(), ".cache", "puppeteer");
  for (const product of desktop ? ["chrome"] : ["chrome-headless-shell", "chrome"]) {
    const folder = path.join(cache, product);
    if (!existsSync(folder)) continue;
    const browser = readdirSync(folder, { recursive: true })
      .map(String)
      .filter((file) =>
        /(?:^|[/\\])(?:chrome-headless-shell(?:\.exe)?|chrome(?:\.exe)?|Google Chrome for Testing|Chromium)$/.test(
          file,
        ),
      )
      .sort()
      .at(-1);
    if (browser) return path.join(folder, browser);
  }
  if (desktop) {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
    ].find((candidate) => existsSync(candidate));
  }
  return undefined;
}
