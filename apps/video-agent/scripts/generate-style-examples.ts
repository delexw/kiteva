import { ExampleDesignSchema } from "../src/shared/agents/schemas/example-design";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadCatalog } from "../src/server/catalog/catalog";
import { agentTurn } from "../src/server/agents/providers";
import { models, safeMessage } from "../src/server/runtime/config";
import { WorkQueue } from "../src/server/jobs/queue";
import {
  examplePrompt,
  examplePromptContext,
  examplesFolder,
  styleArtworkFolder,
  publishExample,
  readExampleRecords,
  writeExampleRecords,
  validateExamplePalette,
} from "../src/server/catalog/style-examples";
import type { Provider, StyleExample } from "../src/shared/contracts";
async function main() {
  const provider = process.argv[2] || "claude";
  if (provider !== "claude" && provider !== "codex") throw Error("Choose claude or codex");
  const catalog = await loadCatalog();
  const selectedIds = process.argv.slice(3).filter((id) => /^style-\d{3}$/.test(id));
  const requested = selectedIds.length
    ? catalog.styles.filter((s) => selectedIds.includes(s.id))
    : catalog.styles;
  const records = new Map((await readExampleRecords()).map((r) => [r.styleId, r]));
  const saveQueue = new WorkQueue(1);
  const model = models[provider];
  const signal = new AbortController();
  for (const event of ["SIGINT", "SIGTERM"]) process.on(event, () => signal.abort());
  async function publishBatch(input: ExampleBatch, author: Provider = provider as Provider) {
    for (const design of input.examples) {
      const style = catalog.styles.find((s) => s.id === design.styleId);
      if (!style) throw Error(`Unknown style ${design.styleId}`);
      const base: StyleExample = {
        styleId: style.id,
        catalogHash: catalog.hash,
        thumbnail: "",
        status: "failed",
        provider: author,
        model: models[author],
      };
      await validateExamplePalette(design.svg, style);
      const record = await publishExample(design, base);
      await saveQueue.run(async () => {
        records.set(style.id, record);
        await writeExampleRecords(
          catalog.styles.map(
            (s) =>
              records.get(s.id) || {
                styleId: s.id,
                catalogHash: catalog.hash,
                thumbnail: "",
                status: "failed",
              },
          ),
        );
      });
      console.log(
        `Ready ${style.id}: ${style.name_en} (${Array.from(records.values()).filter((r) => r.source && r.provider === provider && r.status === "ready").length}/${catalog.styles.length})`,
      );
    }
  }
  type ExampleBatch = ReturnType<typeof ExampleDesignSchema.parse>;
  // Reuse the observed live probe and persisted completed designs instead of generating them again.
  async function reuseDesigns(file: string, author: Provider) {
    const input = ExampleDesignSchema.parse(JSON.parse(await readFile(file, "utf8")));
    for (const design of input.examples) {
      if (
        !requested.some((s) => s.id === design.styleId) ||
        (records.get(design.styleId)?.source && records.get(design.styleId)?.provider === provider)
      )
        continue;
      try {
        await publishBatch({ examples: [design] }, author);
      } catch (error) {
        console.log(`Cached design needs regeneration: ${safeMessage(error).slice(0, 200)}`);
      }
    }
  }
  for (const [folder, author] of [
    ["ai-probe", "claude"],
    ["gpt-probe", "codex"],
  ] as const) {
    try {
      if (author === provider)
        await reuseDesigns(path.join(examplesFolder, folder, "result.json"), author);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        console.log(`Probe not reused: ${safeMessage(error)}`);
    }
  }
  const cacheFolder = path.join(examplesFolder, "ai-batches");
  for (const entry of await readdir(cacheFolder, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    try {
      const metadata = JSON.parse(
        await readFile(path.join(cacheFolder, entry.name, "generation.json"), "utf8"),
      );
      if (metadata.catalogHash !== catalog.hash || metadata.provider !== provider) continue;
      await reuseDesigns(path.join(cacheFolder, entry.name, "result.json"), metadata.provider);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        console.log(`Batch cache not reused: ${safeMessage(error).slice(0, 200)}`);
    }
  }
  // Revalidate earlier studies too: provider selection alone does not guarantee palette fidelity.
  for (const style of requested) {
    const existing = records.get(style.id);
    if (!existing?.source || existing.provider !== provider) continue;
    try {
      await validateExamplePalette(
        await readFile(path.join(styleArtworkFolder, existing.source), "utf8"),
        style,
      );
    } catch (error) {
      records.set(style.id, { ...existing, status: "failed", error: safeMessage(error) });
    }
  }
  const pending = requested.filter((s) => {
    const r = records.get(s.id);
    return !r?.source || r.status !== "ready" || r.provider !== provider;
  });
  const concurrency = Number(process.env.VIDEO_EXAMPLE_CONCURRENCY || 2);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
    throw Error("Example concurrency must be between 1 and 4");
  const queue = new WorkQueue(concurrency);
  const batches = Array.from({ length: Math.ceil(pending.length / 5) }, (_, i) =>
    pending.slice(i * 5, i * 5 + 5),
  );
  await Promise.all(
    batches.map((batch) =>
      queue.run(async () => {
        signal.signal.throwIfAborted();
        const workspace = path.join(examplesFolder, "ai-batches", randomUUID());
        await mkdir(workspace, { recursive: true });
        const prompt = examplePrompt(batch);
        await writeFile(path.join(workspace, "PROMPT.md"), prompt);
        let lastError = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          const started = Date.now();
          const timeout = AbortSignal.timeout(600000);
          const activeSignal = AbortSignal.any([signal.signal, timeout]);
          try {
            const result = await agentTurn({
              provider: provider as Provider,
              workspace,
              readOnly: true,
              promptContext: examplePromptContext(batch),
              signal: activeSignal,
              schema: ExampleDesignSchema,
              prompt: prompt + (lastError ? `\nCorrect this validation error: ${lastError}` : ""),
              onEvent: (event) => {
                if (event.type === "session")
                  console.log(`Generating ${batch.map((s) => s.id).join(", ")} with ${model}`);
              },
            });
            const ids = result.value.examples.map((e) => e.styleId);
            if (
              ids.length !== batch.length ||
              new Set(ids).size !== ids.length ||
              batch.some((s) => !ids.includes(s.id))
            )
              throw Error("Return exactly one design for every requested style ID");
            await writeFile(
              path.join(workspace, "result.json"),
              JSON.stringify(result.value, null, 2),
            );
            await writeFile(
              path.join(workspace, "generation.json"),
              JSON.stringify(
                {
                  catalogHash: catalog.hash,
                  provider,
                  model,
                  sessionId: result.sessionId,
                  elapsedMs: Date.now() - started,
                },
                null,
                2,
              ),
            );
            await publishBatch(result.value);
            return;
          } catch (error) {
            lastError = safeMessage(error);
            if (signal.signal.aborted) throw error;
            console.log(`Batch retry ${attempt + 1}: ${lastError.slice(0, 300)}`);
          }
        }
        for (const style of batch)
          await saveQueue.run(async () => {
            const existing = records.get(style.id);
            if (existing?.source && existing.status === "ready" && existing.provider === provider)
              return;
            records.set(style.id, {
              styleId: style.id,
              catalogHash: catalog.hash,
              thumbnail: existing?.thumbnail || "",
              status: "failed",
              provider: provider as Provider,
              model,
              error: lastError,
            });
            await writeExampleRecords(catalog.styles.map((s) => records.get(s.id)!));
          });
      }),
    ),
  );
  const complete = requested.filter(
    (s) =>
      records.get(s.id)?.source &&
      records.get(s.id)?.status === "ready" &&
      records.get(s.id)?.provider === provider,
  ).length;
  console.log(`Model-authored pages: ${complete}/${requested.length}`);
  if (complete !== requested.length) process.exitCode = 1;
}
void main().catch((error) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
