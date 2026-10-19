import { translateUi, useUiLanguage } from "../i18n";
import { Button, Card, Empty } from "antd";
import { Trash2, SlidersHorizontal } from "lucide-react";
import { isRunSettled, type Run, type Style, type StyleExample } from "../../shared/contracts";
import { projectName } from "../../shared/project-name";
import { ProjectMediaStack } from "./project-media-stack";
import { ProjectStatus } from "./project-status";
import { ProjectSettings } from "./project-settings";

export function ProjectList({
  projects,
  onOpen,
  onDelete,
  onEdit,
  styles = [],
  examples = [],
}: {
  projects: Run[];
  onOpen: (project: Run) => void;
  onDelete: (project: Run) => void;
  onEdit?: (project: Run) => void;
  styles?: Pick<Style, "id" | "name_en">[];
  examples?: StyleExample[];
}) {
  useUiLanguage();
  return (
    <div className="history-list recent-projects-grid">
      {!projects.length && (
        <Empty description={translateUi("Your first project starts with an idea.")} />
      )}
      {projects.map((project) => {
        return (
          <Card key={project.id} className="project-list-card" size="small">
            <ProjectMediaStack project={project} onOpen={() => onOpen(project)} />
            <div className="recent-project-info">
              <header className="recent-project-heading">
                <h2>
                  <button
                    type="button"
                    className="recent-project-open"
                    onClick={() => onOpen(project)}
                    aria-label={translateUi("Open project: {{value0}}", {
                      value0: projectName(project),
                    })}
                  >
                    {projectName(project)}
                  </button>
                </h2>
              </header>
              {project.brief?.objective && (
                <p className="recent-project-description">{project.brief.objective}</p>
              )}
              <div className="recent-project-meta">
                <small>{new Date(project.createdAt).toLocaleDateString()}</small>
                <ProjectStatus phase={project.phase} />
              </div>
              <div className="recent-project-actions">
                <details
                  className="recent-project-settings"
                  aria-label={translateUi("Settings for {{value0}}", {
                    value0: projectName(project),
                  })}
                >
                  <summary>{translateUi("Settings")}</summary>
                  <ProjectSettings run={project} styles={styles} examples={examples} />
                </details>
                {onEdit && (
                  <Button
                    type="text"
                    aria-label={translateUi("Edit settings for {{value0}}", {
                      value0: projectName(project),
                    })}
                    title={translateUi("Edit settings")}
                    icon={<SlidersHorizontal size={15} />}
                    onClick={() => onEdit(project)}
                  />
                )}
                <Button
                  danger
                  type="text"
                  icon={<Trash2 size={15} />}
                  aria-label={translateUi("Delete project: {{value0}}", {
                    value0: projectName(project),
                  })}
                  disabled={!isRunSettled(project)}
                  title={
                    isRunSettled(project)
                      ? translateUi("Delete project")
                      : translateUi("Cancel the project and wait for it to stop first")
                  }
                  onClick={() => onDelete(project)}
                />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
