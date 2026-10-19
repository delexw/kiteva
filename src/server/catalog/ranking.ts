import { jevModel, jevClient } from "../agents/jev";
import { preferenceHistoryPolicy, type PreferenceHistoryRecord } from "./preference-history";
import { assetRequirementsPolicy } from "../../shared/asset-requirements-policy";
import { type StyleSummary } from "../../shared/agents/schemas/style-summary";
import { type Proposal } from "../../shared/agents/schemas/proposals";
import { redactSecrets } from "../runtime/config";
import { randomUUID } from "node:crypto";
import { suggestedCombinationGuidance } from "../../shared/style-combinations";
import type { ProviderEvent } from "../agents/providers";

import { score, noul } from "@typesafe-ai/sdk";
import type {
  ContentBrief,
  Style,
  StyleCandidate,
  CreativeRequest,
} from "../../shared/contracts.js";
export const weights = {
  context: { relevance: 0.4, clarity: 0.35, creativity: 0.1, feasibility: 0.15 },
  creative: { relevance: 0.25, clarity: 0.2, creativity: 0.4, feasibility: 0.15 },
};
export function weightedScore(
  dimensions: Record<string, number>,
  mode: "context" | "creative",
  historyProjects = 0,
) {
  const historyWeight =
    dimensions.preferenceFit === undefined
      ? 0
      : preferenceHistoryPolicy.maxWeight[mode] *
        Math.min(Math.max(historyProjects, 0) / preferenceHistoryPolicy.projectsForFullWeight, 1);
  return (
    Math.round(
      (Object.entries(weights[mode]).reduce((n, [k, w]) => n + (dimensions[k] ?? 0) * w, 0) *
        (1 - historyWeight) +
        (dimensions.preferenceFit ?? 0) * historyWeight) *
        1000,
    ) / 10
  );
}
const levels = {
  relevance: [
    "Conflicts with the subject or required facts",
    "Touches the subject but lacks a useful connection",
    "Supports most required content",
    "Directly expresses the subject and required facts",
  ],
  clarity: [
    "Obscures the main message",
    "Needs substantial adaptation to explain the message",
    "Makes the message understandable with ordinary staging",
    "Naturally clarifies the message and audience needs",
  ],
  creativity: [
    "Arbitrary novelty unrelated to the subject",
    "Familiar presentation with little expressive connection",
    "Expressive interpretation that supports the message",
    "Distinctive and memorable interpretation grounded in the subject",
  ],
  feasibility: [
    "Requires unavailable assets or capabilities",
    "Requires substantial unresolved asset work",
    "Can be built with available assets and code with modest effort",
    "Can be built faithfully and efficiently with available assets and code",
  ],
};
export async function rankOptions(
  brief: ContentBrief,
  options: Proposal[],
  styles: Style[],
  request: CreativeRequest,
  signal: AbortSignal,
  summaries: StyleSummary[],
  onEvent: (event: ProviderEvent) => void = () => {},
  preferenceHistory: PreferenceHistoryRecord[] = [],
) {
  if (request.preference === "random") throw Error("Random selection must bypass ranking");
  const rankingPreference = request.preference;
  const history = preferenceHistory.slice(0, preferenceHistoryPolicy.maxRecords);
  const historyProjects = new Set(history.map((record) => record.projectId)).size;
  const criteria = {
    ...levels,
    ...(history.length
      ? {
          preferenceFit: [
            "Little contextual evidence that this direction fits the recorded user choices",
            "Weak contextual support from the recorded user choices",
            "Reasonable contextual support from related prior selections",
            "Strong contextual support from closely related prior selections and explicit feedback",
          ],
        }
      : {}),
  };
  const client = jevClient();
  const summaryFor = (id: string) => {
    const summary = summaries.find((s) => s.styleId === id);
    if (!summary) throw Error(`Missing model-extracted summary for ${id}`);
    return summary;
  };
  const ranked: StyleCandidate[] = [];
  let model = "";
  for (let offset = 0; offset < options.length; offset += 4) {
    const batch = options.slice(offset, offset + 4);
    const state = {
      brief,
      assetPolicy: assetRequirementsPolicy.rankingGuidance,
      combinationGuidance: suggestedCombinationGuidance,
      availableAssets: brief.assetDescriptions,
      outputType: request.outputType || "video",
      ...(history.length
        ? {
            preferenceHistory: history,
            preferenceHistoryGuidance: preferenceHistoryPolicy.guidance,
          }
        : {}),
      options: batch.map((o, i) => ({
        ...o,
        key: `option${i}`,
        styles: [o.primaryStyleId, ...o.supportingStyleIds].map(summaryFor),
      })),
    };
    const questions = Object.fromEntries(
      batch.flatMap((_o, i) => [
        ...Object.entries(criteria).map(([dim, criteria]) => [
          `option${i}_${dim}`,
          score(
            `Evaluate only option${i} for ${dim}; honor explicit brief constraints.${dim === "preferenceFit" ? " Follow preferenceHistoryGuidance; assess contextual preference evidence without copying history or inferring dislike from failures or unchosen options." : ""}`,
            criteria as [string, string, ...string[]],
          ),
        ]),
        [
          `option${i}_constraints`,
          noul(
            `Does option${i} conflict with an explicit visual preview constraint or require a rendering capability unavailable to code? Follow assetPolicy; optional inputs and full-video audio are not preview blockers.`,
          ),
        ],
      ]),
    );
    const invocationId = randomUUID();
    onEvent({
      type: "invocation",
      message: "Motion Graphic evaluation started",
      data: {
        provider: "jev",
        model: jevModel,
        invocationId,
        preferenceHistory: { records: history.length, projects: historyProjects },
        prompt: {
          system: null,
          user: redactSecrets(JSON.stringify({ model: jevModel, state, questions }, null, 2)),
          outputSchema: null,
          reasoningEffort: null,
          note: "Recorded JEV state and questions submitted to its API. Provider-internal prompt text is not exposed by the SDK.",
        },
      },
    });
    const r = await client.systemOne({ model: jevModel, state, questions }, { signal });
    onEvent({
      type: "usage",
      message: "Motion Graphic evaluation complete",
      data: { provider: "jev", model: r.model, invocationId, usage: r.usage },
    });
    model = r.model;
    batch.forEach((o, i) => {
      const conflict = r.answers[`option${i}_constraints`];
      if (conflict.type !== "noul" || conflict.noul >= 0.5 || !o.feasible) return;
      const dimensions: Record<string, number> = {};
      const confidences: number[] = [];
      for (const dim of Object.keys(criteria)) {
        const a = r.answers[`option${i}_${dim}`];
        if (a.type !== "score") throw Error("Invalid Jev score");
        dimensions[dim] = a.score / 3;
        if (dim !== "preferenceFit") confidences.push(a.confidence);
      }
      ranked.push({
        ...o,
        id: `candidate-${offset + i + 1}`,
        dimensions,
        score: weightedScore(dimensions, rankingPreference, historyProjects),
        confidence: Math.min(...confidences),
      });
    });
  }
  return {
    candidates: ranked.sort((a, b) => b.score - a.score).slice(0, request.candidateCount),
    model,
  };
}
