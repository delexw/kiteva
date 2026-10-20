import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { access, appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import dotenv from "dotenv";
import { appRoot } from "../src/server/runtime/config";
import { command } from "../src/server/runtime/process";

const ReleaseSchema = z.object({
  assets: z.array(
    z.object({
      name: z.string(),
      browser_download_url: z.url(),
      digest: z.string().nullable().optional(),
    }),
  ),
});
export function macOpenScreenAsset(release: unknown, architecture: string) {
  if (!["arm64", "x64"].includes(architecture))
    throw Error(`Unsupported macOS architecture: ${architecture}`);
  const asset = ReleaseSchema.parse(release).assets.find(
    (item) => item.name.startsWith(`Openscreen-Mac-${architecture}-`) && item.name.endsWith(".zip"),
  );
  if (
    !asset ||
    !asset.browser_download_url.startsWith(
      "https://github.com/getopenscreen/openscreen/releases/download/",
    )
  )
    throw Error("Official OpenScreen macOS ZIP asset was not found");
  if (!asset.digest?.match(/^sha256:[a-f0-9]{64}$/))
    throw Error("OpenScreen release asset has no supported SHA-256 digest");
  return asset;
}
export async function setupOpenScreen(
  options: {
    root?: string;
    applicationsDirectory?: string;
    architecture?: string;
    fetch?: typeof fetch;
    run?: typeof command;
  } = {},
) {
  const root = options.root || appRoot;
  const config = dotenv.parse(
    await readFile(path.join(root, ".env.local"), "utf8").catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return "";
    }),
  );
  const configured = process.env.OPENSCREEN_EXECUTABLE || config.OPENSCREEN_EXECUTABLE;
  const existing =
    configured ||
    (!options.applicationsDirectory
      ? "/Applications/Openscreen.app/Contents/MacOS/Openscreen"
      : undefined);
  if (existing) {
    try {
      await access(existing, constants.X_OK);
      console.log("Keeping installed OpenScreen.");
      return existing;
    } catch (error) {
      if (configured)
        throw Error(`Configured OpenScreen is not executable: ${existing}`, { cause: error });
    }
  }
  let directory = options.applicationsDirectory || "/Applications";
  if (!options.applicationsDirectory) {
    try {
      await access(directory, constants.W_OK);
    } catch {
      directory = path.join(os.homedir(), "Applications");
    }
  }
  const target = path.join(directory, "Openscreen.app");
  const executable = path.join(target, "Contents/MacOS/Openscreen");
  // Preserve existing installations, including a user Applications fallback from an earlier setup.
  try {
    await access(executable, constants.X_OK);
  } catch {
    const fetcher = options.fetch || fetch;
    const signal = AbortSignal.timeout(600000);
    const release = await fetcher(
      "https://api.github.com/repos/getopenscreen/openscreen/releases/latest",
      { signal },
    );
    if (!release.ok) throw Error(`OpenScreen release lookup failed: ${release.status}`);
    const asset = macOpenScreenAsset(await release.json(), options.architecture || process.arch);
    const response = await fetcher(asset.browser_download_url, { signal });
    if (!response.ok) throw Error(`OpenScreen download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== asset.digest!.slice(7))
      throw Error("OpenScreen download checksum mismatch");
    const temporary = await mkdtemp(path.join(os.tmpdir(), "kiteva-openscreen-install-"));
    try {
      const archive = path.join(temporary, "openscreen.zip");
      await writeFile(archive, bytes);
      const unpacked = path.join(temporary, "unpacked");
      const run = options.run || command;
      await run("ditto", ["-x", "-k", archive, unpacked], root, signal);
      const unpackedApp = path.join(unpacked, "Openscreen.app");
      await access(path.join(unpackedApp, "Contents/MacOS/Openscreen"), constants.X_OK);
      await mkdir(directory, { recursive: true });
      await run("ditto", [unpackedApp, target], root, signal);
      await access(executable, constants.X_OK);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  if (directory !== "/Applications") {
    await appendFile(
      path.join(root, ".env.local"),
      `\nOPENSCREEN_EXECUTABLE=${JSON.stringify(executable)}\n`,
    );
  }
  console.log(`OpenScreen ready: ${executable}`);
  return executable;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.platform !== "darwin")
    throw Error("This OpenScreen setup supports macOS only. See docs/windows.md for Windows.");
  await setupOpenScreen();
}
