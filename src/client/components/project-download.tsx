import { useEffect, useState } from "react";
import { FolderArchive } from "lucide-react";
import { Tooltip } from "antd";
import { translateUi, useUiLanguage } from "../i18n";
import { terminalPhases, type GenerationJob } from "../../shared/contracts";

export function ProjectDownload({ runId, job }: { runId: string; job: GenerationJob }) {
  useUiLanguage();
  const [available, setAvailable] = useState(false);
  const url = `/api/projects/${runId}/${job.id}`;
  useEffect(() => {
    const controller = new AbortController();
    setAvailable(false);
    const check = async () => {
      try {
        const response = await fetch(`${url}/availability`, { signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json();
        if (!controller.signal.aborted) setAvailable(body.available === true);
      } catch {
        /* A later poll or phase update retries transient failures. */
      }
    };
    void check();
    const timer = setInterval(
      () => {
        void check();
      },
      terminalPhases.has(job.phase) ? 15000 : 5000,
    );
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [url, job.phase]);
  return available ? (
    <Tooltip
      trigger={["hover", "focus"]}
      title={translateUi("Download editable source files and assets as a ZIP.")}
    >
      <a
        className="secondary delivery-icon-button"
        href={url}
        download
        aria-label={translateUi("Download editable project")}
      >
        <FolderArchive size={18} aria-hidden="true" />
      </a>
    </Tooltip>
  ) : null;
}
