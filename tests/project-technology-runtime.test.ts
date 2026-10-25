import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { projectTechnologyRoot } from "../src/server/technology/project-runtime";

const folders: string[] = [];
async function folder() {
  const p = await mkdtemp(path.join(os.tmpdir(), "project-runtime-"));
  folders.push(p);
  return p;
}
afterEach(async () => {
  await Promise.all(folders.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
it("resolves an existing model-prepared project directory without installing anything", async () => {
  const workspace = await folder();
  await mkdir(path.join(workspace, "tools/node"), { recursive: true });
  expect(await projectTechnologyRoot(workspace, "tools/node")).toBe(
    path.join(await projectTechnologyRoot(workspace), "tools/node"),
  );
});
it("rejects traversal, absolute paths, missing directories and symlink escape", async () => {
  const workspace = await folder();
  const outside = await folder();
  for (const directory of ["../other", outside, "missing"])
    await expect(projectTechnologyRoot(workspace, directory)).rejects.toThrow();
  await symlink(outside, path.join(workspace, "escape"));
  await expect(projectTechnologyRoot(workspace, "escape")).rejects.toThrow("inside this project");
});

it("rejects a file supplied as a runtime directory", async () => {
  const workspace = await folder();
  await writeFile(path.join(workspace, "file.json"), "{}");
  await expect(projectTechnologyRoot(workspace, "file.json")).rejects.toThrow("directory");
});
