import { jobVersions } from "./job-versions";
import type { Run } from "./contracts";
import { candidateDisplayTitle } from "./candidate-copy";
import { scopedAssetQuestions } from "./asset-question-scopes";

/** Derive editor text from saved history without modifying the original project. */
export function projectEditBrief(
  run: Run,
  previous?: { instructions: string; historyIds?: string[]; historyText?: string },
) {
  const imported = new Set(previous?.historyIds || []);
  const entries: { id: string; time?: string; text: string }[] = [];
  for (const question of scopedAssetQuestions(run)) {
    if (question.state !== "answered") continue;
    entries.push({
      id: `question:${question.id}:${question.jobId || ""}`,
      time: question.answeredAt || question.createdAt,
      text: `### Question and answer\nQuestion: ${question.question}\nAnswer: ${question.answer || question.fallback}`,
    });
  }
  for (const job of run.jobs) {
    if (job.kind !== "full" || !job.refinementPrompt) continue;
    const candidate = run.candidates.find((item) => item.id === job.candidateId);
    entries.push({
      id: `refinement:${job.id}`,
      time: job.createdAt || job.startedAt,
      text: `### Fine-tune: ${candidateDisplayTitle(candidate)} · version ${jobVersions(run.jobs).get(job.id)}\n${job.refinementPrompt}`,
    });
  }
  const timestamp = (value?: string) => {
    const parsed = Date.parse(value || run.createdAt);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  // Stable sorting preserves displayed order for legacy entries without timestamps.
  entries.sort((a, b) => timestamp(a.time) - timestamp(b.time));
  const added = entries.filter((entry) => !imported.has(entry.id));
  const original = previous?.instructions ?? run.request.instructions;
  const historyText = entries.length
    ? `## Conversation history\n\n${entries.map((entry) => entry.text).join("\n\n")}`
    : "";
  const canReplace = previous?.historyText && original.includes(previous.historyText);
  return {
    instructions:
      added.length || (canReplace && previous.historyText !== historyText)
        ? canReplace
          ? original.replace(previous.historyText!, historyText)
          : `${original}\n\n## Conversation history\n\n${added.map((entry) => entry.text).join("\n\n")}`
        : original,
    historyIds: [...new Set([...imported, ...entries.map((entry) => entry.id)])],
    historyText:
      !previous || canReplace || !previous.historyIds?.length ? historyText : previous.historyText,
  };
}
