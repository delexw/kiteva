import { workspaceFolders, legacyWorkspaceFolders } from "../../shared/workspace";
export { workspaceFolders, legacyWorkspaceFolders } from "../../shared/workspace";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const layoutFile = ".kiteva-layout.json";
const LayoutSchema = z.object({
  version: z.literal(1),
  renderInputs: z.literal(workspaceFolders.artifacts),
});
const layout = { version: 1, renderInputs: workspaceFolders.artifacts } as const;

/** All names and legacy compatibility live here; consumers ask for roles, not directory literals. */
export function workspacePaths(workspace: string) {
  return hasProjectLayout(workspace) ? workspaceFolders : legacyWorkspaceFolders;
}

/** Explicit versioned layout; existing projects remain legacy until migrated deliberately. */
export function hasProjectLayout(workspace: string) {
  const file = path.join(workspace, layoutFile);
  if (!existsSync(file)) return false;
  LayoutSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  return true;
}
export function renderInputRoot(workspace: string) {
  return path.resolve(workspace, hasProjectLayout(workspace) ? layout.renderInputs : ".");
}
export function projectArtifactPath(workspace: string, ...parts: string[]) {
  const root = renderInputRoot(workspace);
  const file = path.resolve(root, ...parts);
  const relative = path.relative(root, file);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw Error("Artifact path must stay inside the render input directory");
  return path.relative(path.resolve(workspace), file).split(path.sep).join("/");
}
export function renderSourcePath(workspace: string, file: string) {
  const root = renderInputRoot(workspace);
  const absolute = path.resolve(workspace, file);
  const relative = path.relative(root, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw Error("Render inputs must stay inside the designated artifacts directory");
  if (existsSync(absolute)) {
    const actual = path.relative(realpathSync(root), realpathSync(absolute));
    if (actual === ".." || actual.startsWith(`..${path.sep}`) || path.isAbsolute(actual))
      throw Error("Render input links must not escape the artifacts directory");
  }
  return absolute;
}
export async function prepareProjectLayout(
  workspace: string,
  options: { onlyIfNew?: boolean } = {},
) {
  if (options.onlyIfNew && existsSync(workspace)) return;
  if (existsSync(path.join(workspace, layoutFile))) hasProjectLayout(workspace);
  for (const folder of new Set(Object.values(workspaceFolders))) {
    const directory = path.join(workspace, folder);
    await mkdir(directory, { recursive: true });
    if ((await lstat(directory)).isSymbolicLink())
      throw Error("Project layout directories cannot be symbolic links");
  }
  await writeFile(path.join(workspace, layoutFile), JSON.stringify(layout));
}
export function projectLayoutGuidance(workspace: string) {
  if (!hasProjectLayout(workspace))
    return "This is an existing project using its original file layout. Preserve the supplied file paths; do not relocate its files during a focused task.";
  const folders = workspacePaths(workspace);
  return `PROJECT FOLDER CONTRACT (all agents and tools): Write every authored/rendered input under ${folders.artifacts}/: shot/page HTML, scripts, styles, bundled libraries and assets (images, extracted footage, fonts, music and speech). Use ${folders.assets}/ for media and ${folders.vendor}/ for bundled code. Manifest sourceFile and shots[].sourceFile are workspace-relative paths beginning with ${folders.artifacts}/; resource URLs inside those files are relative to the ${folders.artifacts}/ render root. For manual renderer CLI commands with --root set to ${folders.artifacts}/, pass the shot as an absolute filesystem path resolved from the workspace and manifest sourceFile; do not resolve that workspace-relative path against --root again. Never load ${folders.taskContext}/, ${folders.logs}/, ${folders.diagnostics}/, ${folders.renders}/, ${folders.runtime}/ or application metadata as visual/render inputs. Copy any required source media into ${folders.assets}/ before referencing it. Save task-only working notes and intermediate model input under ${folders.taskContext}/, logs under ${folders.logs}/, diagnostics under ${folders.diagnostics}/, and generated exports under ${folders.renders}/. Application-owned requirements, plans, manifests and narration state keep the exact paths supplied by the application; read them to author source, but do not load them from a rendered page. Run scaffolding, initialization and bundling commands inside ${folders.artifacts}/. Builders, correctors, capture, audio and other helper agents follow this same contract. Correctors update affected artifacts in place; changing instructions or diagnostics alone must not count as a visual edit. The application serves render inputs only from ${folders.artifacts}/ and hashes this boundary independently of task bookkeeping. Do not move or delete unrelated files.`;
}

/** Native renderer processes use the artifact root; diagnostics still belong to the owning job. */
export function workspaceOwner(directory: string) {
  const root = path.resolve(directory);
  let candidate = root;
  for (;;) {
    if (hasProjectLayout(candidate)) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) return root;
    candidate = parent;
  }
}

export function projectDiagnosticsRoot(directory: string) {
  const owner = workspaceOwner(directory);
  return path.join(owner, workspacePaths(owner).diagnostics);
}
