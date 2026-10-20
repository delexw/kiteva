import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm, access } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { macOpenScreenAsset, setupOpenScreen } from "../scripts/setup-openscreen";
afterEach(() => vi.unstubAllEnvs());
const url =
  "https://github.com/getopenscreen/openscreen/releases/download/v1/Openscreen-Mac-arm64-1.zip";
function release(digest: string, download = url) {
  return {
    assets: [{ name: "Openscreen-Mac-arm64-1.zip", browser_download_url: download, digest }],
  };
}
it("selects only the matching official architecture ZIP with a checksum", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  expect(macOpenScreenAsset(release(digest), "arm64").browser_download_url).toBe(url);
  expect(() => macOpenScreenAsset(release(digest), "x64")).toThrow("not found");
  expect(() => macOpenScreenAsset(release(digest, "https://example.com/app.zip"), "arm64")).toThrow(
    "not found",
  );
  expect(() => macOpenScreenAsset(release(""), "arm64")).toThrow("SHA-256");
});
it("installs a verified archive and persists a nonstandard path without changing existing settings", async () => {
  if (process.platform !== "darwin") return;
  vi.stubEnv("OPENSCREEN_EXECUTABLE", "");
  const root = await mkdtemp(path.join(os.tmpdir(), "openscreen-setup-"));
  try {
    const source = path.join(root, "source", "Openscreen.app");
    const binary = path.join(source, "Contents/MacOS/Openscreen");
    await mkdir(path.dirname(binary), { recursive: true });
    await writeFile(binary, "#!/bin/sh\nexit 0\n");
    await chmod(binary, 0o755);
    const zip = path.join(root, "test.zip");
    await promisify(execFile)("ditto", ["-c", "-k", "--keepParent", source, zip]);
    const bytes = await readFile(zip);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(release(digest))))
      .mockResolvedValueOnce(new Response(bytes));
    const config = path.join(root, ".env.local");
    await writeFile(config, "CUSTOM_SETTING=keep\n");
    const output = await setupOpenScreen({
      root,
      applicationsDirectory: path.join(root, "apps"),
      architecture: "arm64",
      fetch: fetcher,
    });
    await access(output);
    expect(await readFile(config, "utf8")).toContain("CUSTOM_SETTING=keep\n");
    expect(await readFile(config, "utf8")).toContain("OPENSCREEN_EXECUTABLE=");
    expect(await setupOpenScreen({ root, fetch: fetcher })).toBe(output);
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("rejects a corrupted download before extraction or copying", async () => {
  vi.stubEnv("OPENSCREEN_EXECUTABLE", "");
  const root = await mkdtemp(path.join(os.tmpdir(), "openscreen-checksum-"));
  try {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(release(`sha256:${"a".repeat(64)}`))))
      .mockResolvedValueOnce(new Response("wrong bytes"));
    const run = vi.fn();
    await expect(
      setupOpenScreen({
        root,
        applicationsDirectory: path.join(root, "apps"),
        architecture: "arm64",
        fetch: fetcher,
        run,
      }),
    ).rejects.toThrow("checksum mismatch");
    expect(run).not.toHaveBeenCalled();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
