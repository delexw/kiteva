import type { BundledSkill } from "./types";

export const anysearchSkill: BundledSkill = {
  id: "anysearch",
  name: "AnySearch",
  purpose: "research",
  nodePackageType: "commonjs",
  workspacePath: ".agents/skills/anysearch",
  claudeName: "bundled-authoring:anysearch",
  repository: "https://github.com/anysearch-ai/anysearch-skill.git",
  guidance:
    "Use Skill(anysearch) to read tool documentation, CLI parameters, repository examples and source code as needed. Follow .agents/skills/anysearch/SKILL.md.",
};
