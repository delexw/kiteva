import type { Run } from "./contracts";

export function projectName(project: Pick<Run, "brief" | "request">): string {
  const subject = project.brief?.subject?.trim();
  if (subject) return subject;
  const instructions = project.request.instructions.replace(/\s+/g, " ").trim();
  if (!instructions) return "Untitled project";
  const characters = Array.from(instructions);
  return characters.length > 80 ? `${characters.slice(0, 79).join("").trimEnd()}…` : instructions;
}
