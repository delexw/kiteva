import { mergeCorrection, correctionMergeGuidance } from "../src/server/agents/correction-merge";
import { linkWorkspaceDirectory } from "../src/server/runtime/workspace-links";
import { existsSync } from "node:fs";
import {
  publishStylePreviewSource,
  stylePreviewSourceFolder,
} from "../src/server/catalog/style-preview-assets";
import { IllustrationMotionSchema } from "../src/shared/agents/schemas/illustration-motion";
import { ProductionSchema } from "../src/shared/agents/schemas/video";
import { reviewedStyleProductionSchema } from "../src/shared/agents/schemas/style-production";
import { cp, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { agentTurn } from "../src/server/agents/providers";
import { loadCatalog } from "../src/server/catalog/catalog";
import { appRoot, models, safeMessage } from "../src/server/runtime/config";
import {
  examplesFolder,
  styleArtworkFolder,
  readExampleRecords,
  writeExampleRecords,
} from "../src/server/catalog/style-examples";
import {
  readStyleVideos,
  writeStyleVideos,
  isCurrentStylePreview,
  stylePreviewVideoFolder,
} from "../src/server/catalog/style-motion";
import { illustrationMotionRevision } from "../src/server/motion/illustration-motion";
import { renderJob } from "../src/server/rendering/render";
import { verifyVisibleMotion } from "../src/server/motion/motion-visibility";
import { WorkQueue } from "../src/server/jobs/queue";

import { VideoQaError, VideoQaReportSchema, videoQaFindings } from "../src/server/domains/video/qa";
import {
  reviewedStylePreviewPrompt,
  stylePreviewTechnologyPool,
  validateReviewedStyleProduction,
} from "../src/server/catalog/style-preview-authoring";

async function main() {
  if (models.claude !== "claude-opus-5-5") throw Error("Preview repairs require Claude Opus 5.5");
  const catalog = await loadCatalog();
  await mkdir(stylePreviewVideoFolder, { recursive: true });
  const examples = await readExampleRecords();
  const records = new Map((await readStyleVideos()).map((record) => [record.styleId, record]));
  const controller = new AbortController();
  for (const event of ["SIGINT", "SIGTERM"]) process.on(event, () => controller.abort());
  const queue = new WorkQueue(8),
    renders = new WorkQueue(2),
    saves = new WorkQueue(1);
  const failures: string[] = [];
  const refreshRequested = process.argv.includes("--refresh");
  const selected = process.argv.slice(2).filter((argument) => argument !== "--refresh");
  if (refreshRequested && !selected.length)
    throw Error("Refresh requires explicit style IDs to preserve unrelated previews");
  if (selected.some((id) => !catalog.styles.some((style) => style.id === id)))
    throw Error("Unknown requested preview style");
  const pending = catalog.styles.filter((style) => {
    if (selected.length && !selected.includes(style.id)) return false;
    const art = examples.find((record) => record.styleId === style.id);
    const clip = records.get(style.id);
    return (
      art?.provider === "claude" &&
      art.status === "ready" &&
      (refreshRequested || !isCurrentStylePreview(clip, art))
    );
  });
  console.log(`Opus 5.5 repair queue: ${pending.length} previews`);
  await Promise.all(
    pending.map((style) =>
      queue.run(async () => {
        const art = examples.find((record) => record.styleId === style.id)!;
        const folder = path.join(examplesFolder, "video-projects", style.id);
        await mkdir(folder, { recursive: true });
        const savedSource = path.join(stylePreviewSourceFolder, style.id);
        if (existsSync(savedSource))
          await cp(savedSource, folder, { recursive: true, force: false });
        const svg = await readFile(path.join(styleArtworkFolder, art.source!), "utf8");
        await writeFile(path.join(folder, "ILLUSTRATION.svg"), svg);
        await sharp(Buffer.from(svg)).png().toFile(path.join(folder, "ILLUSTRATION.png"));
        await writeFile(path.join(folder, "STYLE.json"), JSON.stringify(style, null, 2));
        await writeFile(
          path.join(folder, "TECHNOLOGY_POOL.json"),
          JSON.stringify(stylePreviewTechnologyPool, null, 2),
        );
        const reviewedStack = Boolean(style.tech.technology_review);
        const nativeAuthoring = reviewedStack || refreshRequested;
        if (nativeAuthoring) {
          await linkWorkspaceDirectory(
            path.join(appRoot, "node_modules"),
            path.join(folder, "node_modules"),
          );
        }
        await copyFile(
          path.join(appRoot, "node_modules/gsap/dist/gsap.min.js"),
          path.join(folder, "gsap.min.js"),
        );
        await copyFile(
          path.join(appRoot, "node_modules/chroma-js/dist/chroma.min.cjs"),
          path.join(folder, "chroma.min.js"),
        );
        const originalHtml = await readFile(path.join(folder, "index.html"), "utf8").catch(
          () => "",
        );
        await writeFile(path.join(folder, "index.before-repair.txt"), originalHtml);
        let previousProduction: unknown;
        try {
          previousProduction = JSON.parse(
            await readFile(path.join(folder, "production.json"), "utf8"),
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        let sessionId: string | undefined;
        try {
          const saved = JSON.parse(await readFile(path.join(folder, "repair-review.json"), "utf8"));
          if (saved.model === models.claude && typeof saved.sessionId === "string")
            sessionId = saved.sessionId;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        let problem = await readFile(path.join(folder, "ERROR.txt"), "utf8").catch(
          () => "No valid motion preview has been published",
        );
        if (refreshRequested)
          problem = `Refresh requirement: demonstrate the reviewed recipe(s) in STYLE.json tech.preview_recipes, rather than only repairing the previous generic study. Follow palette.background_policy and the reviewed source-frame evidence; a prior preview palette is not an approved background restriction. If BACKGROUND_REVIEW.json exists, read it and its local reference contact sheets before authoring. Explain which recipe is demonstrated and how the visible actions implement it.\n${problem}`;
        try {
          const qa = VideoQaReportSchema.parse(
            JSON.parse(await readFile(path.join(folder, "renders/qa-report.json"), "utf8")),
          );
          const findings = videoQaFindings(qa);
          if (findings.length) problem += `\nSpecific QA findings: ${JSON.stringify(findings)}`;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        for (let attempt = 1; attempt <= 3; attempt++) {
          controller.signal.throwIfAborted();
          const authoringEvents: unknown[] = [];
          try {
            console.log(`${style.id}: Opus 5.5 authoring repair ${attempt}/3`);
            const result = await agentTurn({
              provider: "claude",
              workspace: folder,
              sessionId,
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]),
              schema: z.object({
                plan: IllustrationMotionSchema.optional(),
                production: (reviewedStack
                  ? reviewedStyleProductionSchema(style)
                  : ProductionSchema
                ).optional(),
                repairNotes: z.string(),
              }),
              onEvent: (event) => {
                authoringEvents.push({
                  type: event.type,
                  message: event.message.slice(0, 3000),
                  ...(["session", "usage", "invocation"].includes(event.type)
                    ? { data: event.data }
                    : {}),
                });
              },
              promptContext: { previousFailure: problem, currentManifest: previousProduction },
              prompt: nativeAuthoring
                ? reviewedStylePreviewPrompt(
                    style,
                    `Read previousFailure from the required input JSON. ${correctionMergeGuidance}`,
                  )
                : `Repair and author this style's 3-second SILENT motion preview. Read ILLUSTRATION.png with Read to inspect the actual artwork, ILLUSTRATION.svg, STYLE.json and index.html before editing. Style ${style.id}. Preserve the distinctive illustrated scene, all wording and full composition; do not substitute a generic template. Honor explicitly approved colors and material roles. Follow palette.background_policy: catalog swatches are optional for scene_dependent palettes, not mandatory canvas colors. Choose a coherent scene palette and check actual composited contrast. Do not use Blender, Python bpy, Cycles or EEVEE; choose appropriate available tools from TECHNOLOGY_POOL.json. Fix index.html directly. Root standalone data-composition-id="video", width1280 height720 duration3 fps30, register ONE paused GSAP timeline at window.__timelines.video after constructing it; local gsap.min.js and chroma.min.js available. Keep animations seekable and deterministic; no clocks, network or perpetual loops. Choose substantial coherent illustrated objects and meaningful lettering. Strong visible reveals, drawing where paths are truly stroked/unfilled, bounded pose changes within panels/contact points, and purposeful staging. Do not animate the full canvas/background, decorative noise or unrelated tiny elements merely to pass the test. Target at least 8% visibly changing pixels at card size, reaching the complete readable authored scene by2.7s. Preserve SVG authored transforms using neutral wrappers. Actor IDs must really exist and must not be removed during typography preparation; layered Pop Art shadow/lettering are deliberate separate actors, do not deduplicate selected layers. Fix contrast against each label's actual local background using the resolved scene palette while preserving explicitly approved colors; global foreground may be identical to a colored panel! Fix text fit through sizing/position/line breaks without deleting copy. Treat deliberate outlined/offset display-letter layering as intentional only on the specific affected labels, never suppress audits on root or blanket-mark content. Never disable contrast/runtime/layout validation, add data-no-timeline, remove the timeline guard, or hide text. For line drawing, inspect the selected actor's actual fill/stroke, not its name. Return a plan matching the actual chosen actors and motion in the edited HTML plus concise repair notes. Only use approved motion reference IDs from STYLE.json, or no references. Do not run render/browser tests or install anything; the host runs check/render and feeds actual failures back. Current failure: Read previousFailure from the required input JSON.`,
            });
            sessionId = result.sessionId;
            if (!nativeAuthoring && result.value.plan?.styleId !== style.id)
              throw Error("Repair returned the wrong style");
            if (
              result.value.plan?.selectedReferenceIds.some(
                (id) => !style.motion_references.candidates.some((item) => item.motion_id === id),
              )
            )
              throw Error("Unapproved motion reference");
            await writeFile(
              path.join(folder, "repair-review.json"),
              JSON.stringify({ model: models.claude, sessionId, ...result.value }, null, 2),
            );
            const started = Date.now();
            const mergedProduction = nativeAuthoring
              ? mergeCorrection(previousProduction, result.value.production, ProductionSchema)
              : undefined;
            const production = reviewedStack
              ? validateReviewedStyleProduction(mergedProduction, style)
              : nativeAuthoring
                ? ProductionSchema.parse(mergedProduction)
                : ProductionSchema.parse({
                    pipeline: "HyperFrames",
                    fallbackReason: null,
                    sourceFile: "index.html",
                    duration: 3,
                    width: 1280,
                    height: 720,
                    styleRenderer: ["SVG"],
                    motionEngine: ["GSAP"],
                    audioDescription: "Silent",
                    limitations: [
                      "Illustration-led vector motion study authored by Claude Opus 5.5.",
                    ],
                  });
            previousProduction = production;
            await writeFile(
              path.join(folder, "production.json"),
              JSON.stringify(production, null, 2),
            );
            const output = await renders.run(() =>
              renderJob(
                {
                  id: style.id,
                  runId: "style-examples",
                  candidateId: style.id,
                  kind: "preview",
                  phase: "rendering",
                  workspace: folder,
                  model: models.claude,
                  duration: 3,
                },
                production,
                controller.signal,
                () => {},
              ),
            );
            const visibleChangeRatio = await verifyVisibleMotion(
              path.join(folder, output.video),
              controller.signal,
            );
            const video = style.id + path.extname(output.video);
            await copyFile(
              path.join(folder, output.video),
              path.join(stylePreviewVideoFolder, video + ".tmp"),
            );
            await rename(
              path.join(stylePreviewVideoFolder, video + ".tmp"),
              path.join(stylePreviewVideoFolder, video),
            );
            await saves.run(async () => {
              await publishStylePreviewSource(folder, style.id);
              const generatedAt = new Date().toISOString();
              if (nativeAuthoring) {
                const thumbnail = path.join(styleArtworkFolder, `${style.id}.webp`);
                await sharp(path.join(folder, output.poster))
                  .webp({ quality: 92 })
                  .toFile(thumbnail + ".tmp");
                await rename(thumbnail + ".tmp", thumbnail);
                const currentExamples = await readExampleRecords();
                await writeExampleRecords(
                  currentExamples.map((example) =>
                    example.styleId === style.id
                      ? {
                          ...example,
                          generatedAt,
                          designNotes: production.displayDescription || example.designNotes,
                        }
                      : example,
                  ),
                );
              }
              records.set(style.id, {
                styleId: style.id,
                catalogHash: catalog.hash,
                sourceHash: createHash("sha256").update(svg).digest("hex"),
                video,
                duration: 3,
                generatedAt,
                renderMs: Date.now() - started,
                illustrationPlan: result.value.plan,
                reviewed: true,
                motionRevision: illustrationMotionRevision,
                visibleChangeRatio,
                model: models.claude,
              });
              await writeStyleVideos([...records.values()]);
            });
            await rm(path.join(folder, "ERROR.txt"), { force: true });
            console.log(
              `${style.id}: verified MP4 published (${(visibleChangeRatio * 100).toFixed(1)}% visible change)`,
            );
            return;
          } catch (error) {
            if (controller.signal.aborted) throw error;
            problem = safeMessage(
              error instanceof VideoQaError ? JSON.stringify(error.findings) : error,
            );
            await writeFile(path.join(folder, "ERROR.txt"), problem);
            console.log(
              `${style.id}: validation failed on attempt ${attempt}; feeding errors back to Opus`,
            );
          } finally {
            await writeFile(
              path.join(folder, `authoring-events-${attempt}.json`),
              JSON.stringify(authoringEvents, null, 2),
            );
          }
        }
        failures.push(style.id);
      }),
    ),
  );
  console.log(JSON.stringify({ repaired: pending.length - failures.length, remaining: failures }));
  if (failures.length) process.exitCode = 1;
}
void main().catch((error) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
