import { renderInputRoot, renderSourcePath } from "../../runtime/workspace";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  fileHash,
  installedRuntimeFingerprint,
  restoreMultiplaneShot,
  storeMultiplaneShot,
  multiplaneCacheKey,
} from "./cache";
import { multiplaneShotDependencyEvidence } from "./dependencies";
import { multiplaneCacheDirectory } from "./metadata";
import { reviewRenderCache } from "../../jev/strategies/render-cache";
import type { ProviderEvent } from "../../agents/agent";

const FileSchema = z.object({
  hash: z.string(),
  text: z.string().optional(),
  complete: z.boolean(),
});
const SnapshotSchema = z.object({
  files: z.record(z.string(), FileSchema),
  runtime: z.string(),
  digest: z.string(),
});
type Snapshot = z.infer<typeof SnapshotSchema>;
const excluded = new Set(["renders", ".runtime", "node_modules", ".git", "VALIDATION.md"]);
const privateDirectories = new Set([".runtime", "node_modules", ".git"]);
const authoredInput = (file: string) =>
  !file.split(path.sep).some((part) => privateDirectories.has(part)) &&
  !excluded.has(file.split(path.sep)[0]);
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function snapshot(workspace: string, signal: AbortSignal): Promise<Snapshot> {
  const files: Snapshot["files"] = {};
  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      signal.throwIfAborted();
      const absolute = path.join(directory, entry.name),
        relative = path.relative(workspace, absolute);
      if (!authoredInput(relative)) continue;
      if (entry.isSymbolicLink()) throw Error("Symlinked render input");
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        const hash = await fileHash(absolute, signal);
        const text = /\.(html?|m?js|css|svg|json|md|txt|ts|tsx|jsx)$/i.test(entry.name)
          ? await readFile(absolute, "utf8")
          : undefined;
        files[relative] = {
          hash,
          ...(text === undefined ? {} : { text: text.slice(0, 24000) }),
          complete: text !== undefined && text.length <= 24000,
        };
      } else throw Error("Unsupported render input");
    }
  }
  workspace = path.resolve(workspace);
  await visit(renderInputRoot(workspace));
  const runtime = digest({
    native: await installedRuntimeFingerprint(signal),
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    environment: Object.entries(process.env)
      .filter(([key]) =>
        /^(?:MULTIPLANE_|PLAYWRIGHT_|VIDEO_RENDER_|FONTCONFIG_|LANG$|LC_ALL$|TZ$)/.test(key),
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  });
  return {
    files,
    runtime,
    digest: digest({
      runtime,
      files: Object.entries(files).map(([file, value]) => [file, value.hash]),
    }),
  };
}

/** Checkpoints are published per successful shot, so a late failure does not discard earlier work. */
export async function createMultiplaneRecoveryCache(input: {
  workspace: string;
  signal: AbortSignal;
  onEvent: (event: ProviderEvent) => void;
  review?: typeof reviewRenderCache;
}) {
  let current: Snapshot;
  try {
    current = await snapshot(input.workspace, input.signal);
  } catch (error) {
    input.signal.throwIfAborted();
    input.onEvent({
      type: "warning",
      message: "Render checkpoints unavailable; rebuilding without cache.",
      data: { reason: error instanceof Error ? error.message : "Input snapshot unavailable" },
    });
    return undefined;
  }
  const directory = path.join(input.workspace, multiplaneCacheDirectory);
  const sameInputs = async () =>
    (await snapshot(input.workspace, input.signal)).digest === current.digest;
  const review = input.review || reviewRenderCache;
  async function publish(file: string, value: unknown) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(value));
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  let snapshotPublished: Promise<void> | undefined;
  const publishCurrentSnapshot = () =>
    (snapshotPublished ??= publish(
      path.join(directory, "snapshots", `${current.digest}.json`),
      current,
    ).catch((error) => {
      snapshotPublished = undefined;
      throw error;
    }));
  function key(sourceFile: string, settings: unknown) {
    return multiplaneCacheKey("reviewed-cache-v1", {
      sourceFile,
      settings,
      runtime: current.runtime,
    });
  }
  return {
    async restore(sourceFile: string, settings: unknown, output: string) {
      if (!current.files[sourceFile]) return false;
      const id = key(sourceFile, settings);
      try {
        const record = z
          .object({ snapshot: z.string().regex(/^[a-f0-9]{64}$/) })
          .parse(JSON.parse(await readFile(path.join(directory, `review-${id}.json`), "utf8")));
        const previous = SnapshotSchema.parse(
          JSON.parse(
            await readFile(path.join(directory, "snapshots", `${record.snapshot}.json`), "utf8"),
          ),
        );
        if (
          previous.runtime !== current.runtime ||
          previous.digest !== record.snapshot ||
          digest({
            runtime: previous.runtime,
            files: Object.entries(previous.files).map(([file, value]) => [file, value.hash]),
          }) !== previous.digest
        )
          return false;
        if (previous.digest !== current.digest) {
          const changed = [
            ...new Set([...Object.keys(previous.files), ...Object.keys(current.files)]),
          ].filter(
            (file) =>
              authoredInput(file) && previous.files[file]?.hash !== current.files[file]?.hash,
          );
          const evidence = await multiplaneShotDependencyEvidence(
            renderInputRoot(input.workspace),
            {
              sourceFile: path.relative(
                renderInputRoot(input.workspace),
                renderSourcePath(input.workspace, sourceFile),
              ),
              shotSources: [sourceFile],
            },
            input.signal,
          );
          const relevant = [...evidence.files].map((file) =>
            path.relative(path.resolve(input.workspace), file),
          );
          const state = {
            shot: sourceFile,
            unchangedRenderSettings: settings,
            staticGraphComplete: evidence.complete,
            changes: changed.map((file) => ({
              file,
              before: previous.files[file] ?? null,
              after: current.files[file] ?? null,
            })),
            sourceContext: relevant.map((file) => ({ file, ...current.files[file] })),
          };
          const dependenciesUnchanged =
            evidence.complete &&
            relevant.every(
              (file) =>
                current.files[file] && previous.files[file]?.hash === current.files[file].hash,
            );
          if (
            changed.length &&
            !dependenciesUnchanged &&
            !(await review({
              workspace: input.workspace,
              state,
              signal: input.signal,
              onEvent: input.onEvent,
            }))
          )
            return false;
        }
        const restored = await restoreMultiplaneShot({
          workspace: input.workspace,
          key: id,
          output,
          fingerprint: current.digest,
          signal: input.signal,
          validateInputs: sameInputs,
        });
        input.onEvent({
          type: restored ? "notification" : "warning",
          message: restored
            ? "Reused validated shot checkpoint."
            : "Shot checkpoint could not be restored; rebuilding.",
          data: {
            shot: sourceFile,
            cacheOutcome: restored ? "reused" : "refresh",
            reason: restored
              ? "Validated checkpoint restored"
              : "Artifact integrity or current-input validation failed",
          },
        });
        if (restored) {
          await publishCurrentSnapshot();
          await publish(path.join(directory, `review-${id}.json`), { snapshot: current.digest });
        }
        return restored;
      } catch {
        input.signal.throwIfAborted();
        return false;
      }
    },
    async store(sourceFile: string, settings: unknown, output: string) {
      if (!current.files[sourceFile]) return;
      const id = key(sourceFile, settings);
      try {
        // Invalidate the old pointer before replacing bytes: an interrupted publish must miss,
        // never pair a newer artifact with the previous input snapshot.
        await rm(path.join(directory, `review-${id}.json`), { force: true });
        const stored = await storeMultiplaneShot({
          workspace: input.workspace,
          key: id,
          output,
          fingerprint: current.digest,
          signal: input.signal,
          validateInputs: sameInputs,
        });
        if (!stored) return;
        // Metadata is useful only alongside the validated, integrity-protected artifact.
        if (!(await sameInputs())) return;
        await publishCurrentSnapshot();
        await publish(path.join(directory, `review-${id}.json`), { snapshot: current.digest });
      } catch {
        input.signal.throwIfAborted();
      }
    },
  };
}
