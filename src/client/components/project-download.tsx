import { useEffect, useState } from "react";
import { Download } from "lucide-react";
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
    <a className="secondary" href={url} download>
      <Download size={16} /> {translateUi("Download editable project")}
    </a>
  ) : null;
}
