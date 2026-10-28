import type { ModelPromptSummary } from "./model-prompts";
import type { CreativeRequest } from "./contracts";
export interface ModelActivity {
  model: string;
  purpose: string;
  calls: number;
  tools: number;
  cacheHits: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  uncachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheWrite5mTokens: number | null;
  cacheWrite1hTokens: number | null;
  costLow: number | null;
  costHigh: number | null;
  costBasis: string;
  renderCacheReviews?: {
    id: string;
    time: string;
    shot: string | null;
    jobId?: string;
    direction?: string;
    version?: number;
    choice: "reuse" | "refresh" | null;
    confidence: number | null;
    probabilities: { reuse: number | null; refresh: number | null };
    summary?: string;
    renderImpact?: string;
    uncertain?: boolean;
    promptUrl: string;
  }[];
  combinationEvaluation?: {
    selected: {
      id: string;
      title: string;
      styles: string[];
      rationale: string;
      score: number;
      confidence: number;
      evaluationConfidence?: number;
      selectionDecision?: import("./contracts").StyleCandidate["selectionDecision"];
      dimensions: Record<string, number>;
    }[];
    calls: { id: string; time: string; promptUrl: string }[];
  };
  authoringSelections?: {
    jobId: string;
    kind: "preview" | "full";
    direction: string;
    resources: { id: string; name: string; selected: boolean; probability: number | null }[];
  }[];
}
export interface GovernanceProject {
  id: string;
  name: string;
  status: string;
  started: string;
  finished: string | null;
  durationMs: number | null;
  request: CreativeRequest;
  attachments: { name: string; kind: string; bytes: number }[];
  selectedStyles: string[];
  activity: ModelActivity[];
  prompts?: ModelPromptSummary[];
  incompleteHistory: boolean;
}
export interface GovernanceReport {
  generatedAt: string;
  projects: GovernanceProject[];
  models: { function: string; claude: string; codex: string }[];
  pricingDate: string;
  pricingSources: { label: string; url: string }[];
}

export function aggregateModels(activity: ModelActivity[]): ModelActivity[] {
  const rows = new Map<string, ModelActivity>();
  for (const source of activity) {
    let row = rows.get(source.model);
    if (!row) {
      row = {
        ...source,
        purpose: "All recorded functions",
        calls: 0,
        tools: 0,
        cacheHits: 0,
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        uncachedInputTokens: null,
        cacheWriteTokens: null,
        cacheWrite5mTokens: null,
        cacheWrite1hTokens: null,
        costLow: null,
        costHigh: null,
        costBasis: "Known usage subtotal",
      };
      rows.set(source.model, row);
    }
    row.calls += source.calls;
    row.tools += source.tools;
    row.cacheHits += source.cacheHits;
    for (const key of [
      "inputTokens",
      "outputTokens",
      "cachedTokens",
      "uncachedInputTokens",
      "cacheWriteTokens",
      "cacheWrite5mTokens",
      "cacheWrite1hTokens",
      "costLow",
      "costHigh",
    ] as const) {
      if (source[key] != null) row[key] = (row[key] ?? 0) + source[key];
    }
  }
  return [...rows.values()];
}

export const correctionTypeLabels: Record<string, string> = {
  layout: "Layout correction",
  contrast: "Contrast correction",
  technical: "Technical correction",
  pacing: "Pacing correction",
  style: "Motion Graphic correction",
};

export function correctionActivityPurpose(metadata: Record<string, unknown>): string | undefined {
  if (typeof metadata.correctionFocus !== "string") return undefined;
  if (!Object.hasOwn(correctionTypeLabels, metadata.correctionFocus)) return undefined;
  const label = correctionTypeLabels[metadata.correctionFocus];
  if (!label) return undefined;
  const tier =
    metadata.correctionTier === "cheap"
      ? "initial lower-cost repair"
      : metadata.correctionTier === "main"
        ? "main-model repair"
        : undefined;
  return tier ? `${label} · ${tier}` : label;
}
