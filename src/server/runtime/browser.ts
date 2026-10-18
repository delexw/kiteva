import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { userHome } from "./platform";

export function browserExecutablePath() {
  const configured = process.env.HYPERFRAMES_BROWSER_PATH || process.env.VIDEO_BROWSER_PATH;
  if (configured) return configured;
  const cache = process.env.PUPPETEER_CACHE_DIR || path.join(userHome(), ".cache", "puppeteer");
  for (const product of ["chrome-headless-shell", "chrome"]) {
    const folder = path.join(cache, product);
    if (!existsSync(folder)) continue;
    const browser = readdirSync(folder, { recursive: true })
      .map(String)
      .filter((file) => /(?:^|[/\\])(?:chrome-headless-shell(?:\.exe)?|chrome\.exe)$/.test(file))
      .sort()
      .at(-1);
    if (browser) return path.join(folder, browser);
  }
  return undefined;
}
