import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundledSkills } from "./bundled-skills/registry";
export { bundledSkillsGuidance } from "./bundled-skills/registry";
export { anatomySkillPath, claudeAnatomySkillName } from "./bundled-skills/anatomy";
import { appRoot } from "../runtime/config";

export function claudeBundledSkills(workspace: string, enabled: boolean) {
  return {
    plugins: enabled ? [{ type: "local" as const, path: path.join(workspace, ".agents") }] : [],
    skills: enabled ? bundledSkills.map((skill) => skill.claudeName) : [],
  };
}

/** Stage only the pinned, checked-in files; never import user-global SDK settings. */
export async function prepareBundledSkills(workspace: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const root = path.resolve(workspace);
  await mkdir(root, { recursive: true });
  for (const skill of bundledSkills) {
    // mkdir alone would follow a link left by generated code outside the workspace.
    let folder = root;
    for (const segment of skill.workspacePath.split("/")) {
      folder = path.join(folder, segment);
      await mkdir(folder, { recursive: true });
      if (!(await lstat(folder)).isDirectory())
        throw Error("Bundled skill directory must not be a link");
    }
    for (const [relative, expectedHash] of Object.entries(skill.manifest.files)) {
      signal.throwIfAborted();
      const source = path.join(appRoot, "assets/agent-skills", skill.id, relative);
      if (!(await lstat(source)).isFile())
        throw Error(`Invalid bundled ${skill.name} file: ${relative}`);
      const bytes = await readFile(source);
      if (createHash("sha256").update(bytes).digest("hex") !== expectedHash)
        throw Error(`Bundled ${skill.name} integrity check failed: ${relative}`);
      const segments = relative.split("/");
      let destination = folder;
      for (const segment of segments.slice(0, -1)) {
        destination = path.join(destination, segment);
        await mkdir(destination, { recursive: true });
        if (!(await lstat(destination)).isDirectory())
          throw Error("Bundled skill directory must not be a link");
      }
      const file = path.join(folder, relative);
      const existing = await lstat(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
      if (existing && !existing.isFile()) throw Error("Bundled skill file must not be a link");
      await writeFile(file, bytes, { signal });
    }
  }
  signal.throwIfAborted();
  // This root is an explicit Claude plugin as well as Codex's local skill directory.
  // Reject extra plugin components instead of loading generated hooks, MCP or settings.
  const pluginRoot = path.join(root, ".agents");
  for (const [directory, allowed] of [
    [pluginRoot, ["skills", ".claude-plugin"]],
    [path.join(pluginRoot, "skills"), bundledSkills.map((skill) => skill.id)],
  ] as const) {
    for (const name of await readdir(directory))
      if (!(allowed as readonly string[]).includes(name))
        throw Error(`Unexpected bundled plugin component: ${name}`);
  }
  const metadata = path.join(pluginRoot, ".claude-plugin");
  await mkdir(metadata, { recursive: true });
  if (!(await lstat(metadata)).isDirectory()) throw Error("Plugin metadata must not be a link");
  for (const name of await readdir(metadata))
    if (name !== "plugin.json") throw Error(`Unexpected bundled plugin metadata: ${name}`);
  const manifest = path.join(metadata, "plugin.json");
  const existingManifest = await lstat(manifest).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (existingManifest && !existingManifest.isFile())
    throw Error("Plugin manifest must not be a link");
  await writeFile(
    manifest,
    JSON.stringify({
      name: "bundled-authoring",
      version: "1.0.0",
      skills: bundledSkills.map((skill) => `./skills/${skill.id}`),
    }),
    { signal },
  );
}
