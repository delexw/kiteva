import { CombinationReviewSchema } from "../src/shared/agents/schemas/style-combinations";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { loadCatalog } from "../src/server/catalog/catalog";
import { agentTurn } from "../src/server/agents/providers";
import { readExampleRecords, writeExampleRecords } from "../src/server/catalog/style-examples";
import { readStyleVideos, writeStyleVideos } from "../src/server/catalog/style-motion";
import { appRoot, catalogRoot, models, safeMessage } from "../src/server/runtime/config";
import { validateCombinationReview } from "../src/shared/style-combinations";

async function main() {
  if (models.claude !== "claude-opus-5-5")
    throw Error("This review requires Claude Opus 5.5; no model substitution is allowed");
  const catalog = await loadCatalog();
  const catalogPath = path.join(catalogRoot, "video-style-catalog.json");
  const original = await readFile(catalogPath, "utf8");
  const source = JSON.parse(original);
  // Recommendations are excluded so completed analyses can be reused on reruns.
  const { combination_analysis: _analysis, ...baseline } = source;
  baseline.styles = source.styles.map(
    ({ suggested_combinations: _suggestions, ...style }: Record<string, unknown>) => style,
  );
  const sourceHash = createHash("sha256").update(JSON.stringify(baseline)).digest("hex");
  const folder = path.join(appRoot, ".data", "combination-analysis", sourceHash);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "catalog-before.json"), original);
  const ids = catalog.styles.map((style) => style.id);
  const context = catalog.styles.map((style) => ({
    id: style.id,
    name: style.name_en,
    category: style.category,
    visual_cues: style.visual_cues,
    palette: style.palette,
    renderer: style.tech.style_renderer,
    motion: style.tech.motion_engine,
    implementation: style.tech.implementation,
  }));
  const reviews: ReturnType<typeof validateCombinationReview>[] = [];
  // Small checkpointed batches avoid oversized structured output. Two SDK calls at most.
  let next = 0;
  const batches = Array.from({ length: Math.ceil(ids.length / 15) }, (_, index) =>
    ids.slice(index * 15, index * 15 + 15),
  );
  async function worker() {
    while (next < batches.length) {
      const index = next++;
      const batch = batches[index];
      const workspace = path.join(folder, `batch-${index + 1}`);
      await mkdir(workspace, { recursive: true });
      const resultPath = path.join(workspace, "review.json");
      try {
        const checkpoint = JSON.parse(await readFile(resultPath, "utf8"));
        if (checkpoint.model !== models.claude || checkpoint.sourceHash !== sourceHash)
          throw Error("Stale review");
        reviews[index] = validateCombinationReview(checkpoint.review, batch, ids);
        console.log(`Batch ${index + 1}/${batches.length}: reused validated analysis`);
        continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await writeFile(path.join(workspace, "styles.json"), JSON.stringify(context));
      const prompt = `Analyze thoughtful hybrid combinations for these primary styles: ${batch.join(", ")}. Read styles.json, which describes all 115 available styles. You are Claude Opus 5.5 acting as a creative director. Return each requested primary exactly once. Recommend 2 genuinely useful combinations per style, or fewer/none if the style is better alone; never force a pairing. One primary plus one to four supporting styles, only when each adds a concrete role. Larger combinations suit longer videos; recommend simpler combinations when clarity benefits. Assign concrete subordinate roles such as diagram drawing, typography, character treatment, backgrounds, or separate scene roles. Avoid equal mixtures, near-duplicate pairings, generic minimalism on every style, contradictory materials, and arbitrary novelty. Describe both video and interactive HTML applications separately, including accessible/responsive interaction where useful. No invented assets, external services or research claims. Retain the primary identity and its palette exactly: supporting styles adapt to the PRIMARY palette constraints, never merge palette tokens. Keep typography hierarchy, spatial treatment, motion rhythm and transitions coherent. Give best-use context, rationale, consistency rules and specific pitfalls. Assess renderer and asset feasibility from the metadata. selection_guidance must explain when a single style is preferable and when to choose a hybrid. Treat these as optional creative recommendations, not historical or industry standards. Use only existing IDs, never support a style with itself. Keep each prose field concise (one or two sentences). Return structured output only.`;
      await writeFile(path.join(workspace, "PROMPT.md"), prompt);
      console.log(
        `Batch ${index + 1}/${batches.length}: Opus 5.5 analyzing ${batch.length} styles`,
      );
      const result = await agentTurn({
        provider: "claude",
        workspace,
        prompt,
        schema: CombinationReviewSchema,
        signal: AbortSignal.timeout(1200000),
        readOnly: true,
        onEvent: () => {},
      });
      reviews[index] = validateCombinationReview(result.value, batch, ids);
      await writeFile(
        resultPath,
        JSON.stringify(
          {
            model: models.claude,
            sourceHash,
            sessionId: result.sessionId,
            completedAt: new Date().toISOString(),
            review: reviews[index],
          },
          null,
          2,
        ),
      );
      console.log(`Batch ${index + 1}/${batches.length}: validated and saved`);
    }
  }
  await Promise.all([worker(), worker()]);
  const review = validateCombinationReview(
    { styles: reviews.flatMap((item) => item.styles) },
    ids,
    ids,
  );
  // Never overwrite intervening catalog edits or modify existing style metadata.
  if ((await readFile(catalogPath, "utf8")) !== original)
    throw Error(
      "Catalog changed during analysis; saved reviews remain available, but nothing was applied",
    );
  for (const style of source.styles)
    style.suggested_combinations = review.styles.find(
      (row) => row.style_id === style.id,
    )!.suggested_combinations;
  source.combination_analysis = {
    model: models.claude,
    source_hash: sourceHash,
    analyzed_at: new Date().toISOString(),
    guidance:
      "Optional model-analyzed creative recommendations. One primary style controls identity and palette; supporting styles have explicit subordinate roles. Select hybrids only when they improve the brief.",
  };
  await writeFile(`${catalogPath}.tmp`, JSON.stringify(source, null, 2) + "\n");
  await rename(`${catalogPath}.tmp`, catalogPath);
  const updatedCatalog = await loadCatalog();
  // Only recommendation metadata changed, so existing illustrations and motion clips remain valid.
  const examples = await readExampleRecords();
  await writeExampleRecords(
    examples.map((record) =>
      record.catalogHash === catalog.hash
        ? { ...record, catalogHash: updatedCatalog.hash }
        : record,
    ),
  );
  const videos = await readStyleVideos();
  await writeStyleVideos(
    videos.map((record) =>
      record.catalogHash === catalog.hash
        ? { ...record, catalogHash: updatedCatalog.hash }
        : record,
    ),
  );
  console.log(
    `Applied Opus 5.5 recommendations for all ${ids.length} styles; original fields and palettes preserved`,
  );
}
void main().catch((error) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
