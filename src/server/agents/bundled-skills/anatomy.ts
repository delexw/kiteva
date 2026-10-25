import { anatomyPrompt } from "./anatomy-prompt";
import type { BundledSkill } from "./types";

export const anatomySkillPath = ".agents/skills/anatomy";
export const claudeAnatomySkillName = "bundled-authoring:anatomy";
export const anatomySkill: BundledSkill = {
  id: "anatomy",
  name: "Anatomy",
  purpose: "visual_authoring",
  workspacePath: anatomySkillPath,
  claudeName: claudeAnatomySkillName,
  repository: "https://github.com/wheresryan22/anatomy.git",
  guidance: anatomyPrompt(anatomySkillPath),
};
