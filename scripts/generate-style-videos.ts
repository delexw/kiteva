import { publishStylePreviewSource } from "../src/server/catalog/style-preview-assets";
import {
  IllustrationMotionsSchema,
  IllustrationMotionSchema,
  type IllustrationMotion,
} from "../src/shared/agents/schemas/illustration-motion";
import { readFile, writeFile, mkdir, copyFile, rename } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { WorkQueue } from "../src/server/jobs/queue";
import { loadCatalog } from "../src/server/catalog/catalog";
import { agentTurn } from "../src/server/agents/providers";
import { appRoot, models, safeMessage } from "../src/server/runtime/config";
import {
  examplesFolder,
  styleArtworkFolder,
  readExampleRecords,
  validateExamplePalette,
} from "../src/server/catalog/style-examples";
import {
  stylePreviewVideoFolder,
  readStyleVideos,
  writeStyleVideos,
  type StyleVideo,
} from "../src/server/catalog/style-motion";
import {
  illustrationMotionRevision,
  annotateIllustration,
  illustrationMotionPrompt,
  illustrationMotionHtml,
} from "../src/server/motion/illustration-motion";
import { verifyVisibleMotion } from "../src/server/motion/motion-visibility";
import { renderJob } from "../src/server/rendering/render";
import type { GenerationJob, Style } from "../src/shared/contracts";
async function main() {
  const catalog = await loadCatalog();
  await mkdir(stylePreviewVideoFolder, { recursive: true });
  const controller = new AbortController();
  for (const event of ["SIGINT", "SIGTERM"]) process.on(event, () => controller.abort());
  const selectedIds = process.argv.slice(2).filter((id) => /^style-\d{3}$/.test(id));
  const styles = selectedIds.length
    ? catalog.styles.filter((s) => selectedIds.includes(s.id))
    : [...catalog.styles].sort((a, b) => {
        const priority = [
          "style-008",
          "style-011",
          "style-018",
          "style-022",
          "style-026",
          "style-027",
          "style-032",
          "style-031",
        ];
        const score = (id: string) => (priority.includes(id) ? priority.indexOf(id) : -1);
        return (score(a.id) < 0 ? 100 : score(a.id)) - (score(b.id) < 0 ? 100 : score(b.id));
      });
  const authorQueue = new WorkQueue(2),
    renderQueue = new WorkQueue(2),
    saveQueue = new WorkQueue(1);
  const records = new Map((await readStyleVideos()).map((r) => [r.styleId, r]));
  const root = path.join(examplesFolder, "illustration-motion");
  await mkdir(root, { recursive: true });
  while (!controller.signal.aborted) {
    const examples = await readExampleRecords();
    const ready: Array<{ style: Style; svg: string; sourceHash: string }> = [];
    for (const style of styles) {
      const record = examples.find(
        (r) =>
          r.styleId === style.id &&
          r.provider === "claude" &&
          r.status === "ready" &&
          r.catalogHash === catalog.hash &&
          r.source,
      );
      if (!record) continue;
      const svg = await readFile(path.join(styleArtworkFolder, record.source!), "utf8");
      try {
        await validateExamplePalette(svg, style);
      } catch {
        continue;
      }
      const sourceHash = createHash("sha256").update(svg).digest("hex");
      const prior = records.get(style.id);
      if (
        prior?.motionRevision === illustrationMotionRevision &&
        prior.reviewed &&
        prior.sourceHash === sourceHash &&
        prior.catalogHash === catalog.hash
      )
        continue;
      ready.push({ style, svg, sourceHash });
    }
    const batches = Array.from({ length: Math.ceil(ready.length / 5) }, (_, i) =>
      ready.slice(i * 5, i * 5 + 5),
    );
    await Promise.all(
      batches.map((batch) =>
        authorQueue.run(async () => {
          controller.signal.throwIfAborted();
          const workspace = path.join(root, randomUUID());
          await mkdir(workspace, { recursive: true });
          const inputs = [];
          const plans = new Map<string, IllustrationMotion>();
          for (const item of batch) {
            const annotated = annotateIllustration(item.svg);
            const svgFile = path.join(workspace, item.style.id + ".svg"),
              imageFile = path.join(workspace, item.style.id + ".png");
            await writeFile(svgFile, annotated);
            await sharp(Buffer.from(item.svg)).png().toFile(imageFile);
            const cacheFile = path.join(root, item.style.id + ".json");
            try {
              const cached = JSON.parse(await readFile(cacheFile, "utf8"));
              if (
                cached.motionRevision === illustrationMotionRevision &&
                cached.sourceHash === item.sourceHash &&
                cached.catalogHash === catalog.hash
              )
                plans.set(item.style.id, IllustrationMotionSchema.parse(cached.plan));
            } catch {}
            const failure = await readFile(
              path.join(examplesFolder, "video-projects", item.style.id, "ERROR.txt"),
              "utf8",
            ).catch(() => "");
            inputs.push({
              style: item.style,
              svg: svgFile,
              image: imageFile,
              failure: failure.slice(-5000),
            });
          }
          const pending = inputs.filter((item) => !plans.has(item.style.id));
          if (pending.length) {
            const prompt = illustrationMotionPrompt(pending);
            await writeFile(path.join(workspace, "PROMPT.md"), prompt);
            console.log(
              `Claude reviewing actual images: ${pending.map((i) => i.style.id).join(", ")}`,
            );
            const result = await agentTurn({
              provider: "claude",
              workspace,
              prompt,
              promptContext: {
                motions: catalog.motions,
                illustrations: pending.map(({ style, svg, image, failure }) => ({
                  styleId: style.id,
                  name: style.name_en,
                  cues: style.visual_cues,
                  motion: style.tech.motion_engine,
                  references: style.motion_references,
                  svgFile: svg,
                  imageFile: image,
                  previousRenderProblem: failure,
                })),
              },
              schema: IllustrationMotionsSchema,
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]),
              readOnly: true,
              onEvent: (e) => {
                if (e.type === "tool") console.log(`Image review: ${e.message}`);
              },
            });
            const ids = result.value.plans.map((p) => p.styleId);
            if (
              new Set(ids).size !== pending.length ||
              ids.length !== pending.length ||
              pending.some((i) => !ids.includes(i.style.id))
            )
              throw Error("Motion review must cover each actual illustration");
            for (const plan of result.value.plans) {
              const item = batch.find((i) => i.style.id === plan.styleId)!;
              const allowed = (
                item.style.motion_references.candidates as Array<{ motion_id: string }>
              ).map((r) => r.motion_id);
              if (plan.selectedReferenceIds.some((id) => !allowed.includes(id)))
                throw Error("Motion plan chose an unapproved reference");
              plans.set(plan.styleId, plan);
              await writeFile(
                path.join(root, plan.styleId + ".json"),
                JSON.stringify(
                  {
                    motionRevision: illustrationMotionRevision,
                    catalogHash: catalog.hash,
                    sourceHash: item.sourceHash,
                    model: models.claude,
                    sessionId: result.sessionId,
                    plan,
                  },
                  null,
                  2,
                ),
              );
            }
          }
          await Promise.all(
            batch.map((item) =>
              renderQueue.run(async () => {
                controller.signal.throwIfAborted();
                const plan = plans.get(item.style.id)!;
                const folder = path.join(examplesFolder, "video-projects", item.style.id);
                await mkdir(folder, { recursive: true });
                await copyFile(
                  path.join(appRoot, "node_modules/gsap/dist/gsap.min.js"),
                  path.join(folder, "gsap.min.js"),
                );
                await copyFile(
                  path.join(appRoot, "node_modules/chroma-js/dist/chroma.min.cjs"),
                  path.join(folder, "chroma.min.js"),
                );
                await writeFile(
                  path.join(folder, "index.html"),
                  illustrationMotionHtml(
                    annotateIllustration(item.svg),
                    plan,
                    item.style.palette.tokens.foreground,
                    item.style.palette.tokens.background,
                  ),
                );
                const production = {
                  pipeline: "HyperFrames" as const,
                  fallbackReason: null,
                  styleRenderer: ["SVG"],
                  motionEngine: ["GSAP"],
                  sourceFile: "index.html",
                  duration: 3,
                  width: 1280,
                  height: 720,
                  audioDescription: "Silent",
                  limitations: [
                    "Illustrative vector study; motion selected after inspecting its actual image and SVG.",
                  ],
                };
                const job: GenerationJob = {
                  id: item.style.id,
                  runId: "style-examples",
                  candidateId: item.style.id,
                  kind: "preview",
                  phase: "rendering",
                  workspace: folder,
                  model: models.claude,
                  duration: 3,
                };
                const started = Date.now();
                console.log(`Rendering illustration-led motion: ${item.style.id}`);
                try {
                  const output = await renderJob(job, production, controller.signal, () => {});
                  const visibleChangeRatio = await verifyVisibleMotion(
                    path.join(folder, output.video),
                    controller.signal,
                  );
                  const video = item.style.id + path.extname(output.video);
                  await copyFile(
                    path.join(folder, output.video),
                    path.join(stylePreviewVideoFolder, video + ".tmp"),
                  );
                  await rename(
                    path.join(stylePreviewVideoFolder, video + ".tmp"),
                    path.join(stylePreviewVideoFolder, video),
                  );
                  await saveQueue.run(async () => {
                    await publishStylePreviewSource(folder, item.style.id);
                    const record: StyleVideo = {
                      styleId: item.style.id,
                      catalogHash: catalog.hash,
                      sourceHash: item.sourceHash,
                      video,
                      duration: 3,
                      generatedAt: new Date().toISOString(),
                      renderMs: Date.now() - started,
                      illustrationPlan: plan,
                      reviewed: true,
                      motionRevision: illustrationMotionRevision,
                      visibleChangeRatio,
                      model: models.claude,
                    };
                    records.set(item.style.id, record);
                    await writeStyleVideos(Array.from(records.values()));
                  });
                  console.log(`Reviewed video ready: ${item.style.id}`);
                } catch (error) {
                  if (controller.signal.aborted) throw error;
                  await writeFile(path.join(folder, "ERROR.txt"), safeMessage(error));
                  await writeFile(
                    path.join(workspace, item.style.id + "-render-error.txt"),
                    safeMessage(error),
                  );
                  console.log(`Needs motion repair: ${item.style.id}`);
                  await rename(
                    path.join(root, item.style.id + ".json"),
                    path.join(root, item.style.id + "-rejected-" + Date.now() + ".json"),
                  ).catch(() => {});
                }
              }),
            ),
          );
        }),
      ),
    );
    const current = await readExampleRecords();
    const finished = styles.filter((s) => {
      const art = current.find((r) => r.styleId === s.id);
      const clip = records.get(s.id);
      return (
        clip?.motionRevision === illustrationMotionRevision &&
        clip.reviewed &&
        art?.generatedAt &&
        clip.generatedAt >= art.generatedAt &&
        clip.catalogHash === catalog.hash
      );
    }).length;
    console.log(`Reviewed Claude motion demos: ${finished}/${styles.length}`);
    if (finished === styles.length) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      controller.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
void main().catch((error) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
