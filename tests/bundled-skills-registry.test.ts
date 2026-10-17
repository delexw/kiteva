import { expect, it } from "vitest";
import { bundledSkills, bundledSkillsGuidance } from "../src/server/agents/bundled-skills/registry";
import { anatomySkill } from "../src/server/agents/bundled-skills/anatomy";
import { anatomyPrompt } from "../src/server/agents/bundled-skills/anatomy-prompt";
import { claudeBundledSkills } from "../src/server/agents/bundled-skills";

it("uses each skill registration for both prompt assembly and native Claude discovery", () => {
  expect(bundledSkills).toContain(anatomySkill);
  expect(new Set(bundledSkills.map((skill) => skill.id)).size).toBe(bundledSkills.length);
  expect(new Set(bundledSkills.map((skill) => skill.claudeName)).size).toBe(bundledSkills.length);
  expect(bundledSkillsGuidance).toBe(bundledSkills.map((skill) => skill.guidance).join("\n\n"));
  expect(claudeBundledSkills("/workspace", true).skills).toEqual(
    bundledSkills.map((skill) => skill.claudeName),
  );
  for (const skill of bundledSkills) {
    expect(skill.workspacePath).toBe(`.agents/skills/${skill.id}`);
    expect(skill.claudeName).toBe(`bundled-authoring:${skill.id}`);
    expect(skill.manifest.files["SKILL.md"]).toMatch(/^[a-f0-9]{64}$/);
    expect(skill.guidance).toContain(`${skill.workspacePath}/SKILL.md`);
    expect(skill.guidance).toContain(skill.manifest.revision);
  }
});
it("keeps Anatomy prompt metadata bound to its checked-in registration", () => {
  expect(anatomySkill.guidance).toBe(
    anatomyPrompt(anatomySkill.workspacePath, anatomySkill.manifest.revision),
  );
  const prompt = anatomyPrompt(".agents/skills/example", "example-revision");
  expect(prompt).toContain(".agents/skills/example/SKILL.md (revision example-revision)");
  expect(prompt).not.toContain(anatomySkill.manifest.revision);
});
