import type { Run } from "../../shared/contracts";
import { candidateDisplayTitle } from "../../shared/candidate-copy";

export function roomQuestionScope(run: Run, jobId?: string) {
  const job = jobId ? run.jobs.find((item) => item.id === jobId) : undefined;
  if (!job) return "Project";
  const candidate = run.candidates.find((item) => item.id === job.candidateId);
  const title = candidateDisplayTitle(
    candidate,
    candidate ? run.candidates.indexOf(candidate) + 1 : undefined,
  );
  if (job.kind === "preview") return `Preview · ${title}`;
  const versions = run.jobs.filter(
    (item) => item.kind === "full" && item.candidateId === job.candidateId,
  );
  const kind = job.outputType === "page" ? "Full page" : "Full film";
  return `${kind} · ${title} · version ${versions.indexOf(job) + 1}`;
}
