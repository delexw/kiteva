import { RunningProjects } from "./running-projects";
import { Button } from "antd";
import { FileCode2, Film, Plus } from "lucide-react";
import type { Run } from "../../shared/contracts";
import { projectName } from "../../shared/project-name";

export function ProjectSwitcher({
  projects,
  activeId,
  onSelect,
  onNew,
}: {
  projects: Run[];
  activeId?: string;
  onSelect: (project: Run) => void;
  onNew: () => void;
}) {
  if (!projects.length) return null;
  return (
    <nav className="project-switcher" aria-label="Projects">
      <span className="project-switcher-label">Projects</span>
      <div className="project-badges">
        {projects.map((project) => (
          <Button
            key={project.id}
            htmlType="button"
            className="project-badge"
            aria-current={activeId === project.id ? "page" : undefined}
            title={projectName(project)}
            onClick={() => onSelect(project)}
          >
            {project.request.outputType === "page" ? (
              <FileCode2 size={15} aria-hidden="true" />
            ) : (
              <Film size={15} aria-hidden="true" />
            )}
            <span>{projectName(project)}</span>
          </Button>
        ))}
        <Button htmlType="button" className="project-badge project-badge-new" onClick={onNew}>
          <Plus size={15} aria-hidden="true" /> New project
        </Button>
      </div>
      <RunningProjects projects={projects} onOpen={onSelect} />
    </nav>
  );
}
