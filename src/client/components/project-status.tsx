import { translateUi, useUiLanguage } from "../i18n";
import { CircleCheck, CircleAlert, CirclePause, CircleX, LoaderCircle } from "lucide-react";
import type { Phase } from "../../shared/contracts";
const statuses: Record<Phase, { label: string; tone: "ready" | "active" | "error" | "stopped" }> = {
  queued: { label: "Queued", tone: "active" },
  preparing: { label: "Preparing", tone: "active" },
  ranking: { label: "Exploring", tone: "active" },
  generating: { label: "Creating", tone: "active" },
  validating: { label: "Checking", tone: "active" },
  rendering: { label: "Rendering", tone: "active" },
  ready: { label: "Ready", tone: "ready" },
  failed: { label: "Failed", tone: "error" },
  cancelled: { label: "Cancelled", tone: "stopped" },
  interrupted: { label: "Interrupted", tone: "stopped" },
};
export function ProjectStatus({ phase }: { phase: Phase }) {
  useUiLanguage();
  const { label: labelKey, tone } = statuses[phase];
  const label = translateUi(labelKey);
  const Icon =
    tone === "ready"
      ? CircleCheck
      : tone === "active"
        ? LoaderCircle
        : tone === "error"
          ? CircleAlert
          : phase === "cancelled"
            ? CircleX
            : CirclePause;
  return (
    <span
      className="project-status-badge"
      data-tone={tone}
      role="status"
      aria-label={translateUi("Project status: {{value0}}", { value0: label })}
    >
      <Icon size={14} aria-hidden="true" className={tone === "active" ? "spin" : undefined} />
      {label}
    </span>
  );
}
