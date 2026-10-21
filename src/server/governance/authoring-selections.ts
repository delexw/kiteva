import type { Run } from "../../shared/contracts";
import type { ModelActivity } from "../../shared/governance";
import { authoringResources } from "../jev/strategies/visual-authoring";

/** Normalize saved authoring decisions once for the shared Governance table. */
export function jobAuthoringSelection(
  run: Run,
  job: Run["jobs"][number],
  purpose: string,
  model: string,
): NonNullable<ModelActivity["authoringSelections"]>[number] | undefined {
  const sources = {
    "Authoring resource selection": {
      selection: job.authoringResources,
      selectedIds: job.authoringResources?.selectedIds ?? [],
      names: Object.fromEntries(authoringResources.map(({ id, name }) => [id, name])),
    },
    "Audio authoring selection": {
      selection: job.audioAuthoring,
      selectedIds: job.audioAuthoring?.selectedId ? [job.audioAuthoring.selectedId] : [],
      names: { local_audio: "Local audio tools", audio_studio: "Audio Studio" },
    },
  };
  const source = sources[purpose as keyof typeof sources];
  if (!source || source.selection?.source !== "jev" || source.selection.model !== model)
    return undefined;
  const { selection, selectedIds, names } = source;
  const selected = new Set<string>(selectedIds);
  return {
    jobId: job.id,
    kind: job.kind,
    direction:
      run.candidates.find((candidate) => candidate.id === job.candidateId)?.displayTitle || "",
    resources: [...new Set([...selectedIds, ...selection.decisions.map(({ id }) => id)])].map(
      (id) => ({
        id,
        name: (names as Record<string, string>)[id] || id,
        selected: selected.has(id),
        probability:
          selection.decisions.find((decision) => decision.id === id)?.probability ?? null,
      }),
    ),
  };
}
