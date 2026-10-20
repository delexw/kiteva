import type { Run } from "./contracts";

export function projectName(project: Pick<Run, "brief" | "request">): string {
  const subject = project.brief?.subject?.trim();
  const directBuild = Boolean(project.request.selectedStyleIds?.length);
  if (subject && !(directBuild && subject === "Your selection")) return subject;
  const source = directBuild
    ? project.request.instructions.split(/\r?\n/).find((line) => line.trim()) || ""
    : project.request.instructions;
  const instructions = source.replace(/\s+/g, " ").trim();
  if (!instructions) return "Untitled project";
  const characters = Array.from(instructions);
  return characters.length > 80 ? `${characters.slice(0, 79).join("").trimEnd()}…` : instructions;
}
