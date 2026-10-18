import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fromBufferPromise } from "yauzl";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { appRoot } from "../../runtime/config";
import type { BundledSkill } from "./types";

export const authoringSkillRoot = path.join(appRoot, "skills");
const manifestSchema = z.object({
  repository: z.string(),
  revision: z.string().regex(/^[a-f0-9]{40}$/),
  files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
});

export async function installedSkill(skill: BundledSkill, root = authoringSkillRoot) {
  if (!(await lstat(path.join(root, skill.id))).isDirectory())
    throw Error("Skill installation must not be a link");
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.join(root, skill.id, "current.json"), "utf8")),
  );
  if (manifest.repository !== skill.repository) throw Error(`Unexpected ${skill.name} repository`);
  const directory = path.join(root, skill.id, manifest.revision);
  await verifySkillFiles(directory, manifest, skill.name);
  return { directory, manifest };
}

async function verifySkillFiles(
  directory: string,
  manifest: z.infer<typeof manifestSchema>,
  name: string,
) {
  if (!(await lstat(directory)).isDirectory()) throw Error("Skill revision must not be a link");
  for (const [file, hash] of Object.entries(manifest.files)) {
    if (
      file.includes("\\") ||
      path.posix.isAbsolute(file) ||
      path.win32.isAbsolute(file) ||
      file.includes(":") ||
      file.split("/").some((p) => !p || p === "." || p === "..")
    )
      throw Error("Invalid installed skill path");
    let target = directory;
    for (const segment of file.split("/")) {
      target = path.join(target, segment);
      const entry = await lstat(target);
      if (entry.isSymbolicLink()) throw Error("Installed skill must not contain links");
    }
    if (
      createHash("sha256")
        .update(await readFile(target))
        .digest("hex") !== hash
    )
      throw Error(`${name} integrity check failed: ${file}`);
  }
  if (!manifest.files["SKILL.md"] || !manifest.files.LICENSE)
    throw Error(`${name} installation needs SKILL.md and LICENSE`);
}

/** Download without running any upstream code; publish a complete immutable revision atomically. */
export async function updateSkill(skill: BundledSkill, root = authoringSkillRoot) {
  const base = path.join(root, skill.id);
  await mkdir(base, { recursive: true });
  if (!(await lstat(base)).isDirectory()) throw Error("Skill installation must not be a link");
  const scratch = await mkdtemp(path.join(base, ".install-"));
  const checkout = path.join(scratch, "checkout");
  try {
    const repository =
      /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(
        skill.repository,
      );
    if (!repository) throw Error("Skill source must be an HTTPS GitHub repository");
    const response = await fetch(
      `https://codeload.github.com/${repository[1]}/${repository[2]}/zip/HEAD`,
      {
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      },
    );
    if (!response.ok || !response.body)
      throw Error(`Skill download failed: HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 16 * 1024 * 1024) throw Error("Skill download exceeds 16 MB");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const archive = await fromBufferPromise(Buffer.concat(chunks), {
      lazyEntries: true,
      strictFileNames: true,
    });
    let revision: string;
    const names: string[] = [];
    try {
      revision = z
        .string()
        .regex(/^[a-f0-9]{40}$/)
        .parse(archive.comment);
      let archiveRoot: string | undefined;
      let expandedBytes = 0;
      let entryCount = 0;
      for await (const entry of archive.eachEntry()) {
        if (++entryCount > 4096) throw Error("Skill archive has too many entries");
        const directory = entry.fileName.endsWith("/");
        const segments = entry.fileName.replace(/\/$/, "").split("/");
        if (
          segments.some(
            (segment) =>
              !segment ||
              segment === "." ||
              segment === ".." ||
              segment.includes(":") ||
              segment === ".git",
          )
        )
          throw Error("Invalid skill archive path");
        archiveRoot ??= segments[0];
        if (segments[0] !== archiveRoot) throw Error("Skill archive must have one root directory");
        const kind = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (kind && kind !== (directory ? 0o040000 : 0o100000))
          throw Error("Skill archive must not contain links or special files");
        if (directory) continue;
        const relative = segments.slice(1).join("/");
        if (!relative || names.includes(relative))
          throw Error("Invalid or duplicate skill archive file");
        expandedBytes += entry.uncompressedSize;
        if (expandedBytes > 64 * 1024 * 1024) throw Error("Expanded skill archive exceeds 64 MB");
        const destination = path.join(checkout, relative);
        await mkdir(path.dirname(destination), { recursive: true });
        await pipeline(
          await archive.openReadStreamPromise(entry),
          createWriteStream(destination, { flags: "wx" }),
        );
        names.push(relative);
      }
    } finally {
      archive.close();
    }
    const files: Record<string, string> = {};
    for (const file of names) {
      const source = path.join(checkout, file);
      if (!(await lstat(source)).isFile()) throw Error(`Unsupported ${skill.name} file: ${file}`);
      files[file] = createHash("sha256")
        .update(await readFile(source))
        .digest("hex");
    }
    const manifest = manifestSchema.parse({ repository: skill.repository, revision, files });
    if (!files["SKILL.md"] || !files.LICENSE)
      throw Error(`${skill.name} installation needs SKILL.md and LICENSE`);
    if (!(await readFile(path.join(checkout, "SKILL.md"), "utf8")).includes(`name: ${skill.id}`))
      throw Error(`Unexpected ${skill.name} skill identity`);
    const destination = path.join(base, revision);
    const exists = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    if (!exists) await rename(checkout, destination);
    // Validate an existing revision as well; never switch the active pointer to corrupt files.
    const pointer = path.join(scratch, "current.json");
    await writeFile(pointer, JSON.stringify(manifest, null, 2));
    await verifySkillFiles(destination, manifest, skill.name);
    await rename(pointer, path.join(base, "current.json"));
    return await installedSkill(skill, root);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export async function refreshSkills(
  skills: readonly BundledSkill[],
  root = authoringSkillRoot,
  report: (message: string) => void = console.warn,
) {
  for (const skill of skills) {
    try {
      const result = await updateSkill(skill, root);
      report(`${skill.name} installed: ${result.manifest.revision}`);
    } catch {
      try {
        await installedSkill(skill, root);
        report(`${skill.name} update unavailable; using the verified local installation.`);
      } catch {
        report(
          `${skill.name} is unavailable. Connect to the internet and relaunch Kiteva before starting a creative task.`,
        );
      }
    }
  }
}
