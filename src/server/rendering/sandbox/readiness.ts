import { CodedError } from "../../../shared/errors";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "../../runtime/config";
import { browserExecutablePath } from "../../runtime/browser";
import { renderPrivatePaths } from "./private-paths";

const verification = new AsyncLocalStorage<boolean>();
const folder = path.join(dataRoot, "runtime", "render-sandbox");
const marker = path.join(folder, "verified.json");
// Bump when changing the sandbox boundary or its native verification requirements.
const boundaryRevision = 1;
function signature() {
  const require = createRequire(import.meta.url);
  const sourceHash = createHash("sha256");
  for (const file of [
    "windows.ts",
    "windows-exec.ts",
    "codex-command.ts",
    "command-child.ts",
    "command-payload.ts",
    "private-paths.ts",
    "readiness.ts",
    "../../runtime/platform.ts",
    "../../runtime/process-tree.ts",
    "../../runtime/file-output.ts",
  ])
    sourceHash.update(readFileSync(new URL(file, import.meta.url)));
  return createHash("sha256")
    .update(
      JSON.stringify({
        revision: boundaryRevision,
        sourceHash: sourceHash.digest("hex"),
        node: process.version,
        executable: process.execPath,
        cli: require("@openai/codex/package.json").version,
        browser: browserExecutablePath(),
        privatePaths: renderPrivatePaths(),
      }),
    )
    .digest("hex");
}

/** Scoped to the local diagnostic call; concurrent generation cannot inherit this context. */
export function withWindowsSandboxVerification<T>(check: () => Promise<T>) {
  return verification.run(true, check);
}
export async function assertWindowsRenderReady() {
  if (process.platform !== "win32" || verification.getStore()) return;
  try {
    const result = JSON.parse(await readFile(marker, "utf8"));
    if (result.signature === signature()) return;
  } catch {
    /* A missing or invalid proof requires verification again. */
  }
  throw new CodedError(
    "INVALID_REQUEST",
    "Native Windows rendering has not passed its setup checks. Run npm run windows:check in the Kiteva folder.",
  );
}
export async function clearWindowsRenderVerification() {
  await rm(marker, { force: true });
}
export async function recordWindowsRenderVerification() {
  if (!verification.getStore())
    throw Error("Only the native diagnostic can record successful verification");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const temporary = path.join(folder, `verified-${randomUUID()}.tmp`);
  try {
    await writeFile(
      temporary,
      JSON.stringify({ signature: signature(), verifiedAt: new Date().toISOString() }),
      { mode: 0o600 },
    );
    await rename(temporary, marker);
  } finally {
    await rm(temporary, { force: true });
  }
}
