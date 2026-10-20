import type { ProviderEvent } from "../agents/providers";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { agentTurn } from "../agents/providers";
import { appRoot, dataRoot } from "../runtime/config";
import type { Catalog } from "./catalog";
import type { Provider } from "../../shared/contracts";
import { WorkQueue } from "../jobs/queue";
import { textModels } from "../agents/models";

export const summaryModels = textModels;
export const styleSummaryCacheFolder = path.join(appRoot, "assets", "style-summaries");
const revision = 3;
export { StyleSummarySchema, type StyleSummary } from "../../shared/agents/schemas/style-summary";
import { StyleSummarySchema, type StyleSummary } from "../../shared/agents/schemas/style-summary";
const inFlight = new WeakMap<AbortSignal, Map<string, Promise<StyleSummary>>>();
const queue = new WorkQueue(2);
const ExtractionSummarySchema = StyleSummarySchema.extend({ decisionGuidance: z.string().min(1) });
const CachedSummarySchema = z.object({
  summary: StyleSummarySchema,
  model: z.string(),
  provider: z.enum(["claude", "codex"]),
});
type CachedSummary = z.infer<typeof CachedSummarySchema>;

async function saveSummaryCache(file: string, entry: CachedSummary, signal: AbortSignal) {
  signal.throwIfAborted();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + randomUUID() + ".tmp";
  await writeFile(temporary, JSON.stringify(entry, null, 2));
  await rename(temporary, file);
}

export function styleSummarySource(catalog: Catalog, styleId: string) {
  const style = catalog.originalStyles.find((s) => s.id === styleId);
  if (!style) throw Error(`Original metadata not found for ${styleId}`);
  const references = catalog.styles.find((s) => s.id === styleId)!.motion_references.candidates;
  return {
    style,
    productionPolicy: catalog.production_policy,
    motionReferences: catalog.motions.filter((m) => references.some((r) => r.motion_id === m.id)),
  };
}

export async function summarizeStyle(
  source: ReturnType<typeof styleSummarySource>,
  provider: Provider,
  signal: AbortSignal,
  cacheFolder = styleSummaryCacheFolder,
  generate: typeof agentTurn = agentTurn,
  onEvent: (event: ProviderEvent) => void = () => {},
): Promise<StyleSummary> {
  signal.throwIfAborted();
  const model = summaryModels[provider];
  const styleId = String(source.style.id);
  const hash = createHash("sha256").update(JSON.stringify({ revision, source })).digest("hex");
  const folder = path.join(cacheFolder, "shared");
  const file = path.join(folder, `${styleId}-${hash}.json`);
  const reuse = (entry: CachedSummary) => {
    if (entry.summary.styleId !== styleId) throw Error("Summary cache Motion Graphic mismatch");
    onEvent({
      type: "summary_cache",
      message: "Cached Motion Graphic information reused",
      data: { model: entry.model, provider: entry.provider, styleId },
    });
    return entry.summary;
  };
  try {
    return reuse(CachedSummarySchema.parse(JSON.parse(await readFile(file, "utf8"))));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // Both providers contribute to the same source-keyed cache. Preserve attribution
  // when migrating either legacy layout, including the temporary isolated layout.
  for (const previousProvider of [provider, provider === "claude" ? "codex" : "claude"] as const) {
    const previousModel = summaryModels[previousProvider];
    const previousHash = createHash("sha256")
      .update(JSON.stringify({ revision, model: previousModel, source }))
      .digest("hex");
    const previousName = `${styleId}-${previousHash}.json`;
    try {
      const entry = CachedSummarySchema.parse(
        JSON.parse(
          await readFile(path.join(cacheFolder, previousProvider, "models", previousName), "utf8"),
        ),
      );
      if (entry.provider !== previousProvider || entry.model !== previousModel)
        throw Error("Summary cache author mismatch");
      if (entry.summary.styleId !== styleId) throw Error("Summary cache Motion Graphic mismatch");
      await saveSummaryCache(file, entry, signal);
      return reuse(entry);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      const summary = StyleSummarySchema.parse(
        JSON.parse(await readFile(path.join(cacheFolder, previousProvider, previousName), "utf8")),
      );
      if (summary.styleId !== styleId) throw Error("Summary cache Motion Graphic mismatch");
      const entry = { summary, model: previousModel, provider: previousProvider };
      await saveSummaryCache(file, entry, signal);
      return reuse(entry);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // Deduplicate within a request without sharing cancellation across requests.
  const key = file;
  const flights = inFlight.get(signal) || new Map<string, Promise<StyleSummary>>();
  inFlight.set(signal, flights);
  if (flights.has(key)) return flights.get(key)!;
  const task = queue.run(async () => {
    signal.throwIfAborted();
    await mkdir(folder, { recursive: true });
    const result = await generate({
      provider,
      model,
      promptContext: { originalSource: source },
      readOnly: true,
      workspace: path.join(dataRoot, "style-summary-workspaces"),
      signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
      schema: ExtractionSummarySchema,
      onEvent,
      prompt: `Read ALL supplied original metadata without skipping fields. Write concise COMPLETE sentences, about 200 characters per field where practical; never cut off a sentence to fit a limit. Target about 2600 characters across the full summary by compressing phrasing, not omitting decision constraints. Extract decision-useful information for Jev to choose Motion Graphics for either videos or interactive HTML. Cover identity, use cases, limitations, palette roles/constraints (distinguish scene-dependent background suggestions from approved exact colors), motion and interactions, audio, assets, compatible combinations and production responsibilities. Distinguish explicit facts from inferred suitability. Do not invent missing information; say unspecified. Resolve prompt placeholders conceptually rather than copying executable prompts. Names of libraries are useful only with their visual or interaction capability. Preserve exceptions and constraints. In decisionGuidance write standalone comparison prose under these labels: Identity; Advantages; Disadvantages; Combination fit; Visual constraints. Explain the distinctive result, message/audience fit, limitations, meaningful supporting roles, palette/material/motion compatibility and when this style should stand alone. Preserve genuinely required visual restrictions and distinguish facts from inference. Exclude library inventories, implementation commands, renderer defaults/fallbacks, exact contrast statistics, optional motion IDs and generic audio disclaimers from decisionGuidance. Do not invent constraints. Keep decisionGuidance about 800 characters where practical without cutting sentences. Return styleId ${styleId}. Read the complete originalSource in the required input JSON. Do not write code, browse, modify files or inspect unrelated sources.`,
    });
    const summary = StyleSummarySchema.extend({ decisionGuidance: z.string().min(1) }).parse(
      result.value,
    );
    if (summary.styleId !== styleId)
      throw Error("Model returned a different Motion Graphic summary");
    await saveSummaryCache(file, { summary, model, provider }, signal);
    return summary;
  });
  flights.set(key, task);
  try {
    return await task;
  } finally {
    flights.delete(key);
  }
}

export async function prepareStyleSummaries(
  catalog: Catalog,
  provider: Provider,
  signal: AbortSignal,
  onEvent: (event: ProviderEvent) => void = () => {},
) {
  const controller = new AbortController();
  const batchSignal = AbortSignal.any([signal, controller.signal]);
  try {
    return await Promise.all(
      catalog.styles.map((style) =>
        summarizeStyle(
          styleSummarySource(catalog, style.id),
          provider,
          batchSignal,
          undefined,
          undefined,
          onEvent,
        ),
      ),
    );
  } catch (error) {
    controller.abort();
    throw error;
  }
}
