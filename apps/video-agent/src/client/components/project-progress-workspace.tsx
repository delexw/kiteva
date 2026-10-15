import type { ReactNode } from "react";

export function ProjectProgressWorkspace({
  progress,
  children,
}: {
  progress: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="project-progress-workspace">
      <div className="project-live-progress">{progress}</div>
      {children && <div className="project-direction-dock">{children}</div>}
    </div>
  );
}
