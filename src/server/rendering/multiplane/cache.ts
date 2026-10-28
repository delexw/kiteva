import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { multiplaneCli } from "../multiplane";
import { multiplaneCacheDirectory } from "./metadata";
import { multiplaneShotDependencies, type MultiplaneShotScope } from "./dependencies";

const RecordSchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const workerIdentity = randomUUID();

export async function fileHash(file: string, signal: AbortSignal) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { signal })) hash.update(chunk);
  return hash.digest("hex");
}

/** Hash selected dependencies and the whole file inventory, or all inputs without a scope.
 * renders/ is exclusively generated output; node_modules is fingerprinted separately.
 * Symlinked inputs disable reuse rather than escaping the project input boundary.
 */
async function treeHash(
  root: string,
  signal: AbortSignal,
  project = false,
  dependencies?: Set<string>,
) {
  const hash = createHash("sha256");
  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      signal.throwIfAborted();
      if (!project && entry.name === ".bin") continue;
      if (
        project &&
        directory === root &&
        ["renders", "node_modules", ".git", "VALIDATION.md"].includes(entry.name)
      )
        continue;
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error("Symlinked render input");
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile())
        // The directory inventory participates even for unused files.
        hash.update(
          JSON.stringify([
            path.relative(root, file),
            dependencies && !dependencies.has(file) ? "unused-input" : await fileHash(file, signal),
          ]),
        );
      else throw Error("Unsupported render input");
    }
  }
  await visit(root);
  return hash.digest("hex");
}

export async function installedRuntimeFingerprint(signal: AbortSignal) {
  const dependencyRoot = path.resolve(path.dirname(multiplaneCli), "../..");
  return JSON.stringify({
    multiplane: await treeHash(path.dirname(path.dirname(multiplaneCli)), signal),
    three: await treeHash(path.join(dependencyRoot, "three"), signal),
  });
}

/** Missing/unreadable inputs make caching unavailable, never a reason to trust old output. */
export async function multiplaneInputFingerprint(
  workspace: string,
  signal: AbortSignal,
  scope?: MultiplaneShotScope,
) {
  try {
    const dependencies = scope
      ? await multiplaneShotDependencies(workspace, scope, signal)
      : undefined;
    if (dependencies === null) return undefined;
    if (dependencies) {
      for (const file of dependencies) {
        if (!(await lstat(file)).isFile()) return undefined;
      }
    }
    const project = await treeHash(workspace, signal, true, dependencies);
    const runtime = await installedRuntimeFingerprint(signal);
    signal.throwIfAborted();
    return createHash("sha256")
      .update(
        JSON.stringify({
          revision: 2,
          scope: scope
            ? {
                sourceFile: scope.sourceFile,
                shotSources: [...scope.shotSources].sort(),
                additionalFiles: [...(scope.additionalFiles ?? [])].sort(),
              }
            : null,
          workerIdentity,
          project,
          runtime,
          node: process.version,
          platform: process.platform,
          architecture: process.arch,
          environment: Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b)),
        }),
      )
      .digest("hex");
  } catch {
    signal.throwIfAborted();
    return undefined;
  }
}

export function multiplaneCacheKey(inputs: string, settings: unknown) {
  return createHash("sha256").update(JSON.stringify({ inputs, settings })).digest("hex");
}

/** Records are scoped to this workspace and published only after the native render succeeds. */
export async function storeMultiplaneShot(input: {
  workspace: string;
  key: string;
  output: string;
  fingerprint: string;
  signal: AbortSignal;
  scope?: MultiplaneShotScope;
  validateInputs?: () => Promise<boolean>;
}) {
  const directory = path.join(input.workspace, multiplaneCacheDirectory);
  const temporary = path.join(directory, `${randomUUID()}.tmp`);
  try {
    if (!input.fingerprint) return false;
    if (
      !(input.validateInputs
        ? await input.validateInputs()
        : (await multiplaneInputFingerprint(input.workspace, input.signal, input.scope)) ===
          input.fingerprint)
    )
      return false;
    await mkdir(directory, { recursive: true });
    await copyFile(input.output, temporary);
    const sha256 = await fileHash(temporary, input.signal);
    await rename(temporary, path.join(directory, `${input.key}.video`));
    await writeFile(temporary, JSON.stringify({ sha256 }));
    await rename(temporary, path.join(directory, `${input.key}.json`));
    return true;
  } catch {
    input.signal.throwIfAborted();
    // A cache write failure must not invalidate a successful render.
    return false;
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function restoreMultiplaneShot(input: {
  workspace: string;
  key: string;
  output: string;
  fingerprint: string;
  signal: AbortSignal;
  scope?: MultiplaneShotScope;
  validateInputs?: () => Promise<boolean>;
}) {
  const directory = path.join(input.workspace, multiplaneCacheDirectory);
  const temporary = `${input.output}.${randomUUID()}.tmp`;
  try {
    const record = RecordSchema.parse(
      JSON.parse(await readFile(path.join(directory, `${input.key}.json`), "utf8")),
    );
    await mkdir(path.dirname(input.output), { recursive: true });
    await copyFile(path.join(directory, `${input.key}.video`), temporary);
    if ((await fileHash(temporary, input.signal)) !== record.sha256) return false;
    input.signal.throwIfAborted();
    if (
      !(input.validateInputs
        ? await input.validateInputs()
        : (await multiplaneInputFingerprint(input.workspace, input.signal, input.scope)) ===
          input.fingerprint)
    )
      return false;
    await rename(temporary, input.output);
    return true;
  } catch {
    input.signal.throwIfAborted();
    return false;
  } finally {
    await rm(temporary, { force: true });
  }
}
