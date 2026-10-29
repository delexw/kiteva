import slugify from "slugify";
import { candidateDisplayTitle } from "./candidate-copy";
import { jobVersions } from "./job-versions";
import type { GenerationJob, Run } from "./contracts";

/** Use the same direction title and persistent revision number as the result card. */
export function jobDownloadBasename(
  run: {
    candidates: Pick<Run["candidates"][number], "id" | "displayTitle">[];
    jobs: GenerationJob[];
  },
  job: GenerationJob,
) {
  const candidate = run.candidates.find((item) => item.id === job.candidateId);
  const title = candidateDisplayTitle(
    candidate,
    candidate ? run.candidates.indexOf(candidate) + 1 : undefined,
  );
  const name =
    slugify(title, {
      lower: true,
      trim: true,
      remove: /[^\p{L}\p{N}\s-]/gu,
    }) || "direction";
  return `${name}-v${jobVersions(run.jobs).get(job.id) ?? job.version ?? 1}`;
}
