import { translateUi } from "../i18n/service";
import type { Run } from "../../shared/contracts";
import { candidateDisplayTitle } from "../../shared/candidate-copy";

export function roomQuestionScope(run: Run, jobId?: string) {
  const job = jobId ? run.jobs.find((item) => item.id === jobId) : undefined;
  if (!job) return translateUi("Project");
  const candidate = run.candidates.find((item) => item.id === job.candidateId);
  const title = candidateDisplayTitle(
    candidate,
    candidate ? run.candidates.indexOf(candidate) + 1 : undefined,
  );
  if (job.kind === "preview") return translateUi("Preview · {{value0}}", { value0: title });
  const versions = run.jobs.filter(
    (item) => item.kind === "full" && item.candidateId === job.candidateId,
  );
  const kind = job.outputType === "page" ? translateUi("Full page") : translateUi("Full film");
  return translateUi("{{value0}} · {{value1}} · version {{value2}}", {
    value0: kind,
    value1: title,
    value2: versions.indexOf(job) + 1,
  });
}
