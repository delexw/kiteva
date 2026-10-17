/** App-owned registration; upstream skill contents stay in assets/agent-skills. */
export interface BundledSkill {
  id: string;
  name: string;
  workspacePath: string;
  claudeName: string;
  manifest: { revision: string; files: Record<string, string> };
  guidance: string;
}
