import type { Run } from "./contracts";

export function projectName(project: Pick<Run, "brief" | "request">): string {
  return (
    project.brief?.subject?.trim() || project.request.instructions.trim() || "Untitled project"
  );
}
