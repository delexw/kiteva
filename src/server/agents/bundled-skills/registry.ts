import { anysearchSkill } from "./anysearch";
import { anatomySkill } from "./anatomy";
import type { BundledSkill } from "./types";

/** Add each reviewed skill here; staging, prompts and Claude registration use this list. */
export const bundledSkills: readonly BundledSkill[] = [anatomySkill, anysearchSkill];
export const bundledSkillsGuidance = bundledSkills
  .map((skill) => `### ${skill.name}\n\n${skill.guidance}`)
  .join("\n\n");
