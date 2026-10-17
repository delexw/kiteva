import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import anatomy from "../assets/agent-skills/anatomy.manifest.json";
import {
  anatomySkillPath,
  bundledSkillsGuidance,
  prepareBundledSkills,
} from "../src/server/agents/bundled-skills";

const folders: string[] = [];
async function temporaryWorkspace() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "bundled-skills-"));
  folders.push(folder);
  return folder;
}
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
it("stages the complete pinned skill, kit, examples and license and restores edited files", async () => {
  const workspace = await temporaryWorkspace();
  const signal = new AbortController().signal;
  await prepareBundledSkills(workspace, signal);
  const root = path.join(workspace, anatomySkillPath);
  for (const [file, hash] of Object.entries(anatomy.files)) {
    expect(
      createHash("sha256")
        .update(await readFile(path.join(root, file)))
        .digest("hex"),
      file,
    ).toBe(hash);
  }
  expect(await readFile(path.join(root, "LICENSE"), "utf8")).toContain("MIT License");
  await writeFile(path.join(root, "SKILL.md"), "changed");
  await prepareBundledSkills(workspace, signal);
  expect(await readFile(path.join(root, "SKILL.md"), "utf8")).toContain("name: anatomy");
});
it("rejects links out of the workspace without writing to their targets", async () => {
  const workspace = await temporaryWorkspace();
  const outside = await temporaryWorkspace();
  await symlink(outside, path.join(workspace, ".agents"));
  await expect(prepareBundledSkills(workspace, new AbortController().signal)).rejects.toThrow(
    "must not be a link",
  );
  await expect(readFile(path.join(outside, "skills/anatomy/SKILL.md"))).rejects.toThrow();
});
it("rejects linked kit files and respects cancellation", async () => {
  const workspace = await temporaryWorkspace();
  await prepareBundledSkills(workspace, new AbortController().signal);
  const skill = path.join(workspace, anatomySkillPath, "SKILL.md");
  const target = path.join(workspace, "unrelated.txt");
  await writeFile(target, "preserve");
  await rm(skill);
  await symlink(target, skill);
  await expect(prepareBundledSkills(workspace, new AbortController().signal)).rejects.toThrow(
    "must not be a link",
  );
  expect(await readFile(target, "utf8")).toBe("preserve");
  const controller = new AbortController();
  controller.abort();
  await expect(
    prepareBundledSkills(await temporaryWorkspace(), controller.signal),
  ).rejects.toThrow();
});
it("keeps optional authoring separate from selected styles, capture and timeline rendering", () => {
  expect(bundledSkillsGuidance).toContain(`${anatomySkillPath}/SKILL.md`);
  expect(bundledSkillsGuidance).toContain(anatomy.revision);
  expect(bundledSkillsGuidance).toContain("not the default for every 3D scene");
  expect(bundledSkillsGuidance).toContain("absolute composition time");
  expect(bundledSkillsGuidance).toContain("fresh page");
  expect(bundledSkillsGuidance).toContain("built-in capture_video");
});
