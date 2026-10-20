import { jevModel } from "./jev/client";
import { assertWindowsRenderReady } from "./rendering/sandbox/readiness";
import { userHome } from "./runtime/platform";
import { registerRoomRoutes } from "./room/routes";
import { registerSpeechRoutes } from "./audio/routes";
import { speechConfigurationProblem, activeSpeech } from "../shared/speech";
import { assetLimitKind } from "../shared/asset-limits";
import { manualDirection } from "./jobs/manual-direction";
import { inspectAssetLimits, validateProjectAssetLimits } from "./requests/asset-limits";
import { assetLimits, validateAssetLimits } from "../shared/asset-limits";
import { validateBriefSections } from "./requests/brief-sections";
import { recordedModelPrompt } from "./governance/prompts";
import { correctionTypeLabels } from "../shared/governance";
import { CodedError } from "../shared/errors";
import {
  readStyleVideos,
  isSupportedStylePreviewModel,
  isCurrentStylePreview,
  stylePreviewVideoFolder,
} from "./catalog/style-motion";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile, readFile, readdir, realpath, stat, rm } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import { z } from "zod";
import { apiErrorHandler } from "./runtime/api-errors";
import sharp from "sharp";
import {
  RequestSchema,
  isRunSettled,
  type Asset,
  type Run,
  type AgentProgressEvent,
} from "../shared/contracts.js";
import { agentMode, appRoot, dataRoot, models, webPort } from "./runtime/config.js";
import { Store } from "./jobs/store.js";
import { loadCatalog } from "./catalog/catalog.js";
import { Workflow } from "./jobs/workflow.js";
import { projectGovernance } from "./governance/report";
import { videoMimeType } from "./rendering/webm-video";
import { multiplaneStatus } from "./rendering/multiplane";
import {
  multiplaneSettingCoverage,
  multiplaneVersion,
  videoRenderers,
} from "../shared/video-renderers";
import { combinationModels, textModels } from "./agents/models";
import type { GovernanceReport } from "../shared/governance";
import {
  readExampleRecords,
  examplesFolder,
  styleArtworkFolder,
  examplePage,
  isReadyStyleExample,
} from "./catalog/style-examples";
export async function createApp(options: { store?: Store } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 26_000_000 });
  registerSpeechRoutes(app);
  const catalog = await loadCatalog();
  const store = options.store || new Store();
  store.recover();
  const workflow = new Workflow(store, catalog);
  const cache = new Map<string, Run>();
  const deletingRuns = new Set<string>();
  const getRun = (id: string) => {
    if (deletingRuns.has(id))
      throw new CodedError("PROJECT_DELETING", "Project is being deleted", 409);
    const run = cache.get(id) || store.get(id);
    if (!run) throw new CodedError("PROJECT_NOT_FOUND", "Run not found", 404);
    cache.set(id, run);
    return run;
  };
  for (const saved of store.list())
    for (const job of saved.jobs)
      if (job.outputType !== "page" && job.playbackCopies?.status === "making")
        workflow.queuePlaybackCopies(getRun(saved.id), job.id);
  const uploadFolder = path.join(dataRoot, "uploads");
  await mkdir(uploadFolder, { recursive: true });
  app.addHook("onRequest", async (req) => {
    const host = req.headers.host?.split(":")[0];
    if (!["127.0.0.1", "localhost", "["].includes(host || "")) {
      throw new CodedError("ACCESS_DENIED", "Local host required", 403);
    }
    const origin = req.headers.origin;
    if (
      origin &&
      !(origin === "null" && req.method === "GET" && req.url.startsWith("/api/pages/")) &&
      !new Set([
        `http://127.0.0.1:${process.env.VIDEO_AGENT_PORT || 4317}`,
        `http://localhost:${process.env.VIDEO_AGENT_PORT || 4317}`,
        `http://127.0.0.1:${webPort}`,
        `http://localhost:${webPort}`,
      ]).has(origin)
    ) {
      throw new CodedError("ACCESS_DENIED", "Foreign origin rejected", 403);
    }
  });
  app.setErrorHandler(apiErrorHandler);
  await app.register(multipart, { limits: { fileSize: assetLimits.audio.bytes, files: 1 } });
  await registerRoomRoutes(app, store);
  app.get("/api/setup", async () => ({
    speechSupported: true,
    videoLanguageSupported: true,
    agentMode,
    models,
    jevConfigured: Boolean(process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY),
    codexCredentialPresent: Boolean(
      process.env.CODEX_API_KEY ||
      process.env.OPENAI_API_KEY ||
      existsSync(path.join(userHome(), " .codex/auth.json".trim())),
    ),
    claudeCredentialPresent: Boolean(
      process.env.ANTHROPIC_API_KEY ||
      process.env.CLAUDE_CODE_OAUTH_TOKEN ||
      existsSync(path.join(userHome(), ".claude")),
    ),
    modelValidation:
      "Provider access is verified by the first brief turn. No silent model substitution.",
    blenderConfigured: Boolean(process.env.VIDEO_BLENDER_PATH),
    styleCount: catalog.styles.length,
    motionCount: catalog.motions.length,
  }));
  app.get("/api/styles", async () => ({
    hash: catalog.hash,
    styles: catalog.styles.map((s) => ({
      id: s.id,
      name_en: s.name_en,
      category: s.category,
      visual_cues: s.visual_cues,
      palette: s.palette,
      renderer: s.tech.style_renderer.recommended_stack_refs,
      motion: s.tech.motion_engine.recommended_stack_refs,
    })),
  }));
  app.get<{ Params: { id: string } }>("/api/styles/:id", async (req, reply) => {
    const s = catalog.styles.find((s) => s.id === req.params.id);
    return s || reply.code(404).send({ code: "NOT_FOUND", error: "Motion Graphic not found" });
  });
  app.get("/api/motions", async () => catalog.motions);
  app.get("/api/renderers", async () => ({
    renderers: videoRenderers,
    multiplane: {
      ...(await multiplaneStatus(
        path.join(dataRoot, "runtime", "multiplane-doctor"),
        multiplaneVersion,
      )),
      coverage: multiplaneSettingCoverage,
    },
  }));
  app.post("/api/assets", async (req) => {
    const file = await req.file();
    if (!file) throw new CodedError("FILE_REQUIRED", "Choose an asset");
    const idsField = file.fields.assetIds;
    const existingIds = z
      .array(z.string().uuid())
      .max(assetLimits.total.count)
      .parse(idsField && "value" in idsField ? JSON.parse(String(idsField.value)) : []);
    const existingAssets = await validateProjectAssetLimits(existingIds, (id) =>
      store.getAsset(id),
    );
    const extension = path.extname(file.filename).toLowerCase();
    if (
      ![
        ".txt",
        ".md",
        ".json",
        ".csv",
        ".pdf",
        ".docx",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".svg",
        ".mp4",
        ".mov",
        ".webm",
        ".wav",
        ".mp3",
        ".m4a",
      ].includes(extension)
    )
      throw new CodedError("FILE_TYPE_UNSUPPORTED", "Unsupported asset type");
    const buffer = await file.toBuffer();
    if (file.file.truncated) throw new CodedError("FILE_TOO_LARGE", "Asset exceeds 25 MB");
    const id = randomUUID();
    const name = `${id}${extension}`;
    const asset: Asset = {
      id,
      name,
      path: path.join(uploadFolder, name),
      kind: file.mimetype,
      bytes: buffer.length,
      originalName: path.basename(file.filename),
    };
    validateAssetLimits([...existingAssets, asset]);
    await writeFile(asset.path, buffer, { mode: 0o600 });
    try {
      await inspectAssetLimits(asset, buffer);
      validateAssetLimits([...existingAssets, asset]);
      store.asset(asset);
    } catch (error) {
      await rm(asset.path, { force: true });
      throw error;
    }
    return { ...asset, path: undefined, originalName: path.basename(file.filename) };
  });
  app.get("/api/runs", async () => store.list());
  app.get<{ Params: { id: string } }>("/api/assets/:id/preview", async (req, reply) => {
    const asset = store.getAsset(req.params.id);
    if (!asset || !/\.(png|jpe?g|webp|gif|svg)$/i.test(asset.name) || !existsSync(asset.path))
      return reply.code(404).send({ code: "NOT_FOUND", error: "Image preview not found" });
    const preview = await sharp(asset.path)
      .rotate()
      .resize({ width: 320, height: 240, fit: "inside", withoutEnlargement: true })
      .webp()
      .toBuffer();
    return reply.header("Cache-Control", "private, max-age=3600").type("image/webp").send(preview);
  });
  app.get<{ Params: { runId: string; invocationId: string } }>(
    "/api/admin/governance/:runId/prompts/:invocationId",
    async (req, reply) => {
      const run = store.get(req.params.runId);
      if (!run) return reply.code(404).send({ code: "RUN_NOT_FOUND" });
      const prompt = await recordedModelPrompt(
        run,
        store.allEvents(run.id),
        req.params.invocationId,
      );
      return prompt || reply.code(404).send({ code: "NOT_FOUND" });
    },
  );
  app.get("/api/admin/governance", async (): Promise<GovernanceReport> => ({
    generatedAt: new Date().toISOString(),
    pricingDate: "2026-10-13",
    pricingSources: [
      { label: "OpenAI pricing", url: "https://developers.openai.com/api/docs/pricing" },
      {
        label: "GPT Astra pricing",
        url: "https://developers.openai.com/api/docs/models/gpt-6-astra",
      },
      { label: "Claude pricing", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
      { label: "Jev pricing", url: "https://docs.typesafe.ai/models" },
    ],
    models: [
      {
        function: "Brief asset self-review and alignment repair",
        claude: textModels.claude,
        codex: textModels.codex,
      },
      {
        function: "Full-video result quality review",
        claude: textModels.claude,
        codex: textModels.codex,
      },
      {
        function: "Preview video planning",
        claude: "Not used",
        codex: "gpt-6.1-sol before each preview",
      },
      {
        function: "Full video planning",
        claude: "Selected main model before implementation, in the same session",
        codex: "Selected main model before implementation, in the same session",
      },
      {
        function: "Previews and full generation",
        claude: models.claude,
        codex: models.codex,
      },
      {
        function: "Brief preparation, Motion Graphic information extraction and generated lyrics",
        claude: textModels.claude,
        codex: textModels.codex,
      },
      {
        function: "Motion Graphic combination proposals",
        claude: combinationModels.claude,
        codex: combinationModels.codex,
      },
      {
        function: "Combination evaluation and direction selection",
        claude: jevModel,
        codex: jevModel,
      },
      ...Object.entries(correctionTypeLabels).map(([focus, label]) => ({
        function: label,
        claude: ["pacing", "style"].includes(focus)
          ? "Selected main model"
          : `${textModels.claude} for eligible fixes; selected main model otherwise`,
        codex: ["pacing", "style"].includes(focus)
          ? "Selected main model"
          : `${textModels.codex} for eligible fixes; selected main model otherwise`,
      })),
    ],
    projects: store.allRuns().map((run) => {
      const project = projectGovernance(run, store.allEvents(run.id));
      project.attachments = run.request.assetIds.map((id) => {
        const asset = store.getAsset(id);
        return asset
          ? { name: asset.originalName || asset.name, kind: asset.kind, bytes: asset.bytes }
          : { name: "Unavailable attachment", kind: "unknown", bytes: 0 };
      });
      project.selectedStyles = project.selectedStyles.map(
        (id) => catalog.styles.find((style) => style.id === id)?.name_en || id,
      );
      return project;
    }),
  }));
  app.post("/api/runs", async (req, reply) => {
    const request = RequestSchema.parse(req.body);
    await assertWindowsRenderReady();
    if (request.outputType === "video") {
      const problem = speechConfigurationProblem(request);
      if (problem) throw new CodedError("INVALID_REQUEST", problem);
      const speech = activeSpeech(request);
      if (speech?.mode === "uploaded") {
        const asset = store.getAsset(speech.assetId);
        if (!asset || assetLimitKind(asset.originalName || asset.name) !== "audio")
          throw new CodedError("INVALID_REQUEST", "Choose an attached audio recording for vocals.");
      }
    }
    if (request.selectedStyleIds?.length) manualDirection(request, catalog.styles);
    validateBriefSections(request, (id) => store.getAsset(id));
    await validateProjectAssetLimits(request.assetIds, (id) => store.getAsset(id));
    const run: Run = {
      id: randomUUID(),
      request,
      phase: "queued",
      createdAt: new Date().toISOString(),
      candidates: [],
      jobs: [],
    };
    cache.set(run.id, run);
    store.save(run);
    void workflow.prepare(run);
    return reply.code(202).send(run);
  });
  app.get<{ Params: { id: string } }>("/api/runs/:id", async (req) => getRun(req.params.id));
  app.get<{ Params: { id: string } }>("/api/runs/:id/assets", async (req) => ({
    assets: getRun(req.params.id).request.assetIds.map((id) => {
      const asset = store.getAsset(id);
      return {
        id,
        originalName: asset?.originalName || asset?.name || "Unavailable attachment",
        bytes: asset?.bytes,
        durationSeconds: asset?.durationSeconds,
        documentPages: asset?.documentPages,
      };
    }),
  }));
  app.post<{ Params: { id: string; questionId: string } }>(
    "/api/runs/:id/asset-questions/:questionId",
    async (req) => {
      const run = getRun(req.params.id);
      const body = z
        .object({ assetIds: z.array(z.string().uuid()).default([]) })
        .passthrough()
        .parse(req.body);
      await validateProjectAssetLimits(
        [...new Set([...run.request.assetIds, ...body.assetIds])],
        (id) => store.getAsset(id),
      );
      return workflow.answerAssetQuestion(run, req.params.questionId, req.body);
    },
  );
  app.post<{ Params: { id: string } }>("/api/runs/:id/cancel", async (req) => {
    const run = getRun(req.params.id);
    const body = z.object({ jobId: z.string().optional() }).parse(req.body || {});
    workflow.cancel(run, body.jobId);
    return run;
  });
  app.post<{ Params: { id: string } }>("/api/runs/:id/retry", async (req) => {
    const run = getRun(req.params.id);
    const body = z.object({ jobId: z.string().optional() }).parse(req.body || {});
    workflow.retry(run, body.jobId);
    return run;
  });
  app.post<{ Params: { id: string } }>("/api/runs/:id/playback-copies", async (req, reply) => {
    const run = getRun(req.params.id);
    const body = z.object({ jobId: z.string() }).parse(req.body || {});
    const queued = workflow.queuePlaybackCopies(run, body.jobId);
    return reply.code(queued ? 202 : 200).send(run);
  });
  const fullLocks = new Map<string, Promise<unknown>>();
  app.post<{ Params: { id: string } }>("/api/runs/:id/directions", async (req, reply) => {
    const run = getRun(req.params.id);
    if (fullLocks.has(run.id)) throw new CodedError("PROJECT_ACTIVE", "A build is starting", 409);
    // Preconditions execute synchronously before the new preparation starts.
    const task = workflow.regenerateDirections(run);
    void task;
    return reply.code(202).send(run);
  });

  app.delete<{ Params: { id: string } }>("/api/runs/:id", async (req) => {
    const id = z.uuid().parse(req.params.id);
    const run = getRun(id);
    if (!isRunSettled(run) || workflow.hasActiveTasks(run) || fullLocks.has(id))
      throw new CodedError(
        "PROJECT_ACTIVE",
        "Cancel the project and wait for it to stop before deleting it.",
        409,
      );
    deletingRuns.add(id);
    try {
      await workflow.stopPlaybackCopies(run);
      await rm(path.join(dataRoot, "runs", id), { recursive: true, force: true });
      store.delete(id);
      cache.delete(id);
      return { deleted: true, id };
    } finally {
      deletingRuns.delete(id);
    }
  });
  app.post<{ Params: { id: string } }>("/api/runs/:id/refine", async (req, reply) => {
    const run = getRun(req.params.id);
    const body = z
      .object({ jobId: z.string(), prompt: z.string().trim().min(1).max(6000) })
      .parse(req.body);
    if (fullLocks.has(run.id)) throw new CodedError("PROJECT_ACTIVE", "A build is starting", 409);
    const task = workflow.refineVideo(run, body.jobId, body.prompt);
    fullLocks.set(run.id, task);
    try {
      return reply.code(202).send(await task);
    } finally {
      fullLocks.delete(run.id);
    }
  });
  app.post<{ Params: { id: string } }>("/api/runs/:id/full", async (req) => {
    const run = getRun(req.params.id);
    const body = z
      .object({
        candidateId: z.string(),
        feedback: z.string().max(6000).optional(),
      })
      .parse(req.body);
    const key = run.id;
    const pending = fullLocks.get(key);
    if (pending) return pending;
    const task = workflow.full(run, body.candidateId, body.feedback);
    fullLocks.set(key, task);
    try {
      return await task;
    } finally {
      fullLocks.delete(key);
    }
  });
  const eventStreams = new Set<import("node:http").ServerResponse>();
  app.addHook("preClose", async () => {
    for (const stream of eventStreams) stream.end();
  });
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/api/runs/:id/events",
    async (req, reply) => {
      getRun(req.params.id);
      const rawCursor = Number(req.headers["last-event-id"] || req.query.after || 0);
      let cursor = Number.isFinite(rawCursor) ? Math.max(0, rawCursor) : 0;
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.flushHeaders();
      const send = (e: AgentProgressEvent) => {
        if (e.id <= cursor) return;
        cursor = e.id;
        reply.raw.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
      };
      const listener = (e: AgentProgressEvent) => send(e);
      store.bus.on(req.params.id, listener);
      let page;
      do {
        page = store.events(req.params.id, cursor);
        page.forEach(send);
      } while (page.length === 500);
      const keep = setInterval(() => reply.raw.write(": keepalive\n\n"), 15000);
      eventStreams.add(reply.raw);
      req.raw.on("close", () => {
        eventStreams.delete(reply.raw);
        clearInterval(keep);
        store.bus.off(req.params.id, listener);
      });
    },
  );
  app.get("/api/examples", async () => {
    const videos = await readStyleVideos();
    return {
      catalogHash: catalog.hash,
      examples: await Promise.all(
        (await readExampleRecords())
          .filter((record) => catalog.styles.some((style) => style.id === record.styleId))
          .map(async (record) => {
            if (!isReadyStyleExample(record))
              return {
                ...record,
                status: "failed",
                source: undefined,
                model: undefined,
                provider: undefined,
                thumbnail: "",
                error: "Claude replacement is being generated",
              };
            const clip = videos.find((video) => isCurrentStylePreview(video, record));
            const needsRepair =
              !clip &&
              (await readFile(
                path.join(examplesFolder, "video-projects", record.styleId, "ERROR.txt"),
                "utf8",
              )
                .then(() => true)
                .catch(() => false));
            return {
              ...record,
              motionStatus: clip ? "ready" : needsRepair ? "needs_repair" : "pending",
              video: clip?.video,
              videoGeneratedAt: clip?.generatedAt,
              duration: clip?.duration,
              selectedMotionReferenceIds: clip?.illustrationPlan?.selectedReferenceIds,
              motionDescription: clip?.illustrationPlan?.rationale || clip?.recipe?.rationale,
            };
          }),
      ),
    };
  });
  app.get<{ Params: { id: string } }>("/api/examples/:id/video", async (req, reply) => {
    if (!/^style-\d{3}$/.test(req.params.id)) return reply.code(404).send();
    const clip = (await readStyleVideos()).find(
      (v) =>
        v.styleId === req.params.id && isSupportedStylePreviewModel(v.model) && v.reviewed === true,
    );
    if (!clip) return reply.code(404).send();
    return reply.type(videoMimeType(clip.video)).sendFile(clip.video, stylePreviewVideoFolder);
  });
  app.get<{ Params: { id: string } }>("/api/examples/:id/page", async (req, reply) => {
    if (!/^style-\d{3}$/.test(req.params.id)) return reply.code(404).send();
    const record = (await readExampleRecords()).find(
      (r) => r.styleId === req.params.id && r.source && isReadyStyleExample(r),
    );
    if (!record)
      return reply
        .code(404)
        .send({ code: "ARTIFACT_UNAVAILABLE", error: "One-page study is not generated yet" });
    return reply
      .type("text/html")
      .header(
        "Content-Security-Policy",
        "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
      )
      .send(
        examplePage(
          req.params.id,
          (await readStyleVideos()).some(
            (v) =>
              v.styleId === req.params.id &&
              isSupportedStylePreviewModel(v.model) &&
              v.reviewed === true,
          ),
          record.authorship === "application",
        ),
      );
  });
  app.get<{ Params: { id: string } }>("/api/examples/:id/source", async (req, reply) => {
    if (!/^style-\d{3}$/.test(req.params.id)) return reply.code(404).send();
    const record = (await readExampleRecords()).find(
      (r) => r.styleId === req.params.id && r.source && isReadyStyleExample(r),
    );
    if (!record) return reply.code(404).send();
    return reply
      .type("image/svg+xml")
      .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      .send(createReadStream(path.join(styleArtworkFolder, `${req.params.id}.svg`)));
  });
  app.get<{ Params: { id: string } }>("/api/examples/:id", async (req, reply) => {
    if (!/^style-\d{3}$/.test(req.params.id)) return reply.code(404).send();
    const record = (await readExampleRecords()).find((r) => r.styleId === req.params.id);
    if (!isReadyStyleExample(record)) return reply.code(404).send();
    const filename = path.join(styleArtworkFolder, `${req.params.id}.webp`);
    if (!existsSync(filename)) return reply.code(404).send();
    return reply.type("image/webp").send(createReadStream(filename));
  });
  async function artifact(runId: string, jobId: string, file: string) {
    const run = getRun(runId);
    const job = run.jobs.find((j) => j.id === jobId);
    if (!job) throw new CodedError("NOT_FOUND", "Job not found");
    const target = await realpath(path.resolve(job.workspace, file));
    if (
      !target.startsWith(`${job.workspace}${path.sep}`) ||
      target.includes(`${path.sep}node_modules${path.sep}`)
    )
      throw Error("Invalid artifact path");
    return target;
  }
  app.get<{ Params: { runId: string; jobId: string; "*": string } }>(
    "/api/artifacts/:runId/:jobId/*",
    async (req, reply) => {
      const file = await artifact(req.params.runId, req.params.jobId, req.params["*"]);
      if ([".html", ".js", ".mjs", ".svg"].includes(path.extname(file))) {
        reply.header("Content-Disposition", `attachment; filename="${path.basename(file)}"`);
        reply.header("Content-Security-Policy", "sandbox");
      }
      const rel = path.relative(dataRoot, file);
      return reply.sendFile(rel, dataRoot);
    },
  );
  app.get<{ Params: { runId: string; jobId: string; "*": string } }>(
    "/api/pages/:runId/:jobId/*",
    async (req, reply) => {
      const run = getRun(req.params.runId);
      const job = run.jobs.find((j) => j.id === req.params.jobId);
      if (job?.outputType !== "page" || job.phase !== "ready")
        throw new CodedError("PAGE_NOT_READY", "Page is not ready");
      const file = await artifact(run.id, job.id, req.params["*"] || "index.html");
      const resourceRoot = `http://${req.headers.host}/api/pages/${run.id}/${job.id}/`;
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header(
        "Content-Security-Policy",
        `sandbox allow-scripts; default-src 'none'; script-src ${resourceRoot} 'unsafe-inline'; style-src ${resourceRoot} 'unsafe-inline'; img-src ${resourceRoot} data: blob:; font-src ${resourceRoot} data:; media-src ${resourceRoot} blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
      );
      reply.header("X-Content-Type-Options", "nosniff");
      return reply.sendFile(path.relative(dataRoot, file), dataRoot);
    },
  );
  app.get<{ Params: { runId: string; jobId: string } }>(
    "/api/projects/:runId/:jobId",
    async (req, reply) => {
      const run = getRun(req.params.runId);
      const job = run.jobs.find((j) => j.id === req.params.jobId);
      if (!job) throw new CodedError("NOT_FOUND", "Job not found");
      const files: Record<string, Uint8Array> = {};
      let total = 0;
      async function collect(folder: string) {
        for (const entry of await readdir(folder, { withFileTypes: true })) {
          if (
            entry.isSymbolicLink() ||
            ["node_modules", "renders", ".codex", ".claude"].includes(entry.name)
          )
            continue;
          const full = path.join(folder, entry.name);
          if (entry.isDirectory()) await collect(full);
          else {
            total += (await stat(full)).size;
            if (total > 100_000_000) throw Error("Project exceeds ZIP size limit");
            files[path.relative(job!.workspace, full)] = await readFile(full);
          }
        }
      }
      await collect(job.workspace);
      return reply
        .header("Content-Disposition", "attachment; filename=video-project.zip")
        .type("application/zip")
        .send(Buffer.from(zipSync(files)));
    },
  );
  await app.register(staticFiles, { root: path.join(appRoot, "dist/client"), wildcard: false });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({ code: "NOT_FOUND", error: "Not found" })
      : reply.sendFile("index.html"),
  );
  app.addHook("onClose", async () => {
    await workflow.shutdown();
    store.close();
  });
  return { app, store, workflow, catalog };
}
