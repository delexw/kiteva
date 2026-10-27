import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { appRoot, dataRoot } from "../src/server/runtime/config";
import { command } from "../src/server/runtime/process";
import {
  multiplaneCli,
  multiplaneEnvironment,
  runMultiplane,
} from "../src/server/rendering/multiplane";

/** Resolve Playwright from Multiplane so installation matches the renderer's pinned revision. */
export async function setupMultiplane(signal = AbortSignal.timeout(900000)) {
  signal.throwIfAborted();
  const require = createRequire(path.join(appRoot, "node_modules/multiplane/package.json"));
  const cli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");
  const workspace = path.join(dataRoot, "setup", "multiplane");
  await mkdir(workspace, { recursive: true });
  await command(
    process.execPath,
    [cli, "install", "chromium"],
    workspace,
    signal,
    (text) => process.stdout.write(text),
    600000,
    false,
    () => {},
    multiplaneEnvironment(),
  );
  await runMultiplane(
    "doctor",
    [multiplaneCli, "doctor", "--json"],
    workspace,
    signal,
    (text) => process.stdout.write(text),
    60000,
  );
  console.log("Multiplane ready: matching Chromium installed and doctor passed.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await setupMultiplane();
