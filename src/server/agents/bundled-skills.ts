import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import anatomy from "../../../assets/agent-skills/anatomy.manifest.json";
import { appRoot } from "../runtime/config";

export const anatomySkillPath = ".agents/skills/anatomy";
export const claudeAnatomySkillName = "bundled-authoring:anatomy";

export function claudeBundledSkills(workspace: string, enabled: boolean) {
  return {
    plugins: enabled ? [{ type: "local" as const, path: path.join(workspace, ".agents") }] : [],
    skills: enabled ? [claudeAnatomySkillName] : [],
  };
}

export const bundledSkillsGuidance = `BUNDLED AUTHORING SKILL: Anatomy is installed locally at ${anatomySkillPath}/SKILL.md (revision ${anatomy.revision}). Claude: invoke the registered native Skill tool with bundled-authoring:anatomy when using Anatomy. Codex: read the local SKILL.md with your coding tools. No installation or web search is needed. Read SKILL.md and its relevant references and examples before using its kit. Use Anatomy for detailed isometric mechanisms, technical objects and explanatory illustrations when they fit the task, or when explicitly requested. It is optional, not the default for every 3D scene. Its rotating/sliding/hinged 3D mode is beta; read references/3d.md before using it. Keep the supplied bundle unchanged; copy needed kit modules and LICENSE into the composition's local vendor directory. Kiteva's task scope, selected palette, style, renderer and export contract take precedence over the skill's standalone framing and interaction defaults. Anatomy is an authoring kit, not an export engine. For video, drive every part, readout and shader from absolute composition time (3D controller.set supports synchronous poses); disable pointer input, idle tours, requestAnimationFrame loops and wall-clock simulation. Verify identical frames when seeking backward, forward and directly to the same time, including a fresh page. Do not change renderers or promise unsupported features silently. Use Kiteva's built-in capture_video for website footage; Anatomy screenshot scripts are only for inspecting generated local figures. Do not install global skills, publish to its gallery, or make network requests.`;

/** Stage only the pinned, checked-in files; never import user-global SDK settings. */
export async function prepareBundledSkills(workspace: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const root = path.resolve(workspace);
  await mkdir(root, { recursive: true });
  // mkdir alone would follow a link left by generated code outside the workspace.
  let folder = root;
  for (const segment of anatomySkillPath.split("/")) {
    folder = path.join(folder, segment);
    await mkdir(folder, { recursive: true });
    if (!(await lstat(folder)).isDirectory())
      throw Error("Bundled skill directory must not be a link");
  }
  for (const [relative, expectedHash] of Object.entries(anatomy.files)) {
    signal.throwIfAborted();
    const source = path.join(appRoot, "assets/agent-skills/anatomy", relative);
    if (!(await lstat(source)).isFile()) throw Error(`Invalid bundled Anatomy file: ${relative}`);
    const bytes = await readFile(source);
    if (createHash("sha256").update(bytes).digest("hex") !== expectedHash)
      throw Error(`Bundled Anatomy integrity check failed: ${relative}`);
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
  signal.throwIfAborted();
  // This root is an explicit Claude plugin as well as Codex's local skill directory.
  // Reject extra plugin components instead of loading generated hooks, MCP or settings.
  const pluginRoot = path.join(root, ".agents");
  for (const [directory, allowed] of [
    [pluginRoot, ["skills", ".claude-plugin"]],
    [path.join(pluginRoot, "skills"), ["anatomy"]],
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
      skills: ["./skills/anatomy"],
    }),
    { signal },
  );
}
