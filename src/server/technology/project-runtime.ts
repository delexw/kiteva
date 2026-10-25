import { realpath, stat } from "node:fs/promises";
import path from "node:path";

/** Resolve only an existing model-prepared directory inside this project. No installation. */
export async function projectTechnologyRoot(workspace: string, directory = ".") {
  const base = await realpath(workspace);
  if (path.isAbsolute(directory) || directory.split(/[\\/]/).includes(".."))
    throw Error("Use a project-relative runtime directory without parent traversal");
  const root = await realpath(path.resolve(base, directory));
  if (root !== base && !root.startsWith(base + path.sep))
    throw Error("Technology runtime must remain inside this project");
  if (!(await stat(root)).isDirectory()) throw Error("Technology runtime must be a directory");
  return root;
}
