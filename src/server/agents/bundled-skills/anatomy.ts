import manifest from "../../../../assets/agent-skills/anatomy.manifest.json";
import { anatomyPrompt } from "./anatomy-prompt";
import type { BundledSkill } from "./types";

export const anatomySkillPath = ".agents/skills/anatomy";
export const claudeAnatomySkillName = "bundled-authoring:anatomy";
export const anatomySkill: BundledSkill = {
  id: "anatomy",
  name: "Anatomy",
  workspacePath: anatomySkillPath,
  claudeName: claudeAnatomySkillName,
  manifest,
  guidance: anatomyPrompt(anatomySkillPath, manifest.revision),
};
