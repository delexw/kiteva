import { translateUi, useUiLanguage } from "../i18n";
import { useEffect, useState } from "react";
import { Button, Popover } from "antd";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown, ArrowUpRight } from "lucide-react";
import type { Run } from "../../shared/contracts";
import { projectName } from "../../shared/project-name";
import { projectOverview } from "../lib/project-overview";

export function RunningProjects({
  projects,
  onOpen,
}: {
  projects: Run[];
  onOpen: (project: Run) => void;
}) {
  useUiLanguage();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const reducedMotion = useReducedMotion();
  const running = projects.filter((project) => projectOverview(project).active);
  useEffect(() => {
    if (!open || !running.length) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, running.length]);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      content={
        <motion.div
          className="running-project-panel"
          initial={reducedMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <strong>{translateUi("Running projects")}</strong>
          {!running.length && <p>{translateUi("No projects running. You’re all caught up.")}</p>}
          <div className="running-project-rows">
            {running.map((project) => {
              const overview = projectOverview(project);
              const minutes = Math.max(
                0,
                Math.floor((now - Date.parse(overview.startedAt)) / 60000),
              );
              return (
                <button
                  key={project.id}
                  type="button"
                  className="running-project-row"
                  onClick={() => {
                    setOpen(false);
                    onOpen(project);
                  }}
                >
                  <span className="running-project-dot" />
                  <span>
                    <strong>{projectName(project)}</strong>
                    <span>
                      {overview.stage} · {minutes}
                      {translateUi("m elapsed")}
                    </span>
                    {overview.previewCount > 0 && (
                      <small>
                        {overview.readyPreviews}/{overview.previewCount}
                        {" " + translateUi("previews ready")}
                      </small>
                    )}
                  </span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </motion.div>
      }
    >
      <Button
        className="running-project-trigger"
        aria-expanded={open}
        aria-label={translateUi("Running projects: {{value0}}", { value0: running.length })}
      >
        <span className="running-project-wave" aria-hidden="true">
          {[0, 1, 2].map((bar) => (
            <motion.i
              key={bar}
              animate={
                running.length && !reducedMotion ? { scaleY: [0.35, 1, 0.35] } : { scaleY: 0.5 }
              }
              transition={{ duration: 1.2, repeat: Infinity, delay: bar * 0.18 }}
            />
          ))}
        </span>
        {translateUi("Running ·") + " "}
        {running.length}
        <ChevronDown size={13} aria-hidden="true" />
      </Button>
    </Popover>
  );
}
