import { anatomySkill } from "./anatomy";
import type { BundledSkill } from "./types";

/** Add each reviewed skill here; staging, prompts and Claude registration use this list. */
export const bundledSkills: readonly BundledSkill[] = [anatomySkill];
export const bundledSkillsGuidance = bundledSkills.map((skill) => skill.guidance).join("\n\n");
