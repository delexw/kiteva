import * as nativeReadiness from "../src/server/rendering/sandbox/readiness";
import { CodedError } from "../src/shared/errors";
import { mkdtemp, writeFile, rm, mkdir, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Run } from "../src/shared/contracts";
import path from "node:path";
import { appRoot, dataRoot, webPort } from "../src/server/runtime/config";
import { RequestSchema } from "../src/shared/contracts";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createApp } from "../src/server/app";
import { Store } from "../src/server/jobs/store";
import { api } from "../src/client/lib/api";
import sharp from "sharp";
import { unzipSync } from "fflate";
let server: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  server = await createApp({ store: new Store(":memory:") });
});
afterAll(async () => {
  await server.app.close();
});
const headers = { host: "127.0.0.1:4317" };
describe("local application API", () => {
  it("serves frontend assets created after startup and never substitutes HTML for missing assets", async () => {
    await server.app.ready();
    const filename = `late-frontend-${randomUUID()}.js`;
    const directory = path.join(appRoot, "dist/client/assets");
    const file = path.join(directory, filename);
    await mkdir(directory, { recursive: true });
    const source = 'console.log("rebuilt frontend");';
    try {
      await writeFile(file, source);
      const response = await server.app.inject({ url: `/assets/${filename}`, headers });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toMatch(/javascript/);
      expect(response.body).toBe(source);
    } finally {
      await rm(file, { force: true });
    }
    const missing = await server.app.inject({ url: `/assets/${filename}`, headers });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers["content-type"]).toContain("application/json");
    expect(missing.json().code).toBe("NOT_FOUND");
    const page = await server.app.inject({ url: "/projects", headers });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
  });
  it("rejects project attachment limits even when the frontend is bypassed", async () => {
    const assetIds = Array.from({ length: 9 }, () => randomUUID());
    for (const id of assetIds)
      server.store.asset({
        id,
        name: `${id}.png`,
        originalName: "reference.png",
        path: "/tmp/reference.png",
        kind: "image/png",
        bytes: 1,
      });
    const response = await server.app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: { instructions: "Explain a simple story", assetIds },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("TOO_MANY_IMAGES");
  });
  it("rejects oversized image uploads before publishing an asset", async () => {
    const boundary = "asset-policy-test";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      Buffer.alloc(10_000_001),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await server.app.inject({
      method: "POST",
      url: "/api/assets",
      headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("FILE_TOO_LARGE");
  });

  it("requires explicit reference decisions and accepts supported uploads", async () => {
    const id = randomUUID();
    const questionId = randomUUID();
    const audioQuestionId = randomUUID();
    const audioId = randomUUID();
    server.store.asset({
      id: audioId,
      name: `${audioId}.wav`,
      originalName: "sound.wav",
      durationSeconds: 1,
      path: "/tmp/sound.wav",
      kind: "audio/wav",
      bytes: 1,
    });
    server.store.save({
      id,
      phase: "preparing",
      createdAt: "now",
      request: RequestSchema.parse({ instructions: "Explain a generic product" }),
      candidates: [],
      jobs: [],
      assetQuestions: [
        {
          id: questionId,
          kind: "images",
          reason: "Exact photo unavailable",
          question: "Use a code illustration?",
          fallback: "Use a code illustration",
          state: "open",
        },
        {
          id: audioQuestionId,
          kind: "voice",
          reason: "Speech tool unavailable",
          question: "Supply a voice recording?",
          fallback: "Use captions",
          state: "open",
        },
      ],
    });
    try {
      const invalid = await server.app.inject({
        method: "POST",
        url: `/api/runs/${id}/asset-questions/${questionId}`,
        headers,
        payload: { assetIds: [audioId] },
      });
      expect(invalid.statusCode).toBe(400);
      expect(server.store.get(id)?.assetQuestions?.[0].state).toBe("open");
      const unanswered = await server.app.inject({
        method: "POST",
        url: `/api/runs/${id}/asset-questions/${questionId}`,
        headers,
        payload: {},
      });
      expect(unanswered.statusCode).toBe(400);
      expect(server.store.get(id)?.assetQuestions?.[0].state).toBe("open");
      const continued = await server.app.inject({
        method: "POST",
        url: `/api/runs/${id}/asset-questions/${questionId}`,
        headers,
        payload: { answer: "Use a code illustration" },
      });
      expect(continued.statusCode).toBe(200);
      expect(continued.json().phase).toBe("preparing");
      expect(continued.json().assetQuestions[0]).toMatchObject({
        state: "answered",
        answer: "Use a code illustration",
      });
      const supplied = await server.app.inject({
        method: "POST",
        url: `/api/runs/${id}/asset-questions/${audioQuestionId}`,
        headers,
        payload: { answer: "Use this recording", assetIds: [audioId] },
      });
      expect(supplied.statusCode).toBe(200);
      expect(supplied.json().request.requirements.music.assetIds).toEqual([audioId]);
      expect(supplied.json().request.assetIds).toEqual([audioId]);
      expect(supplied.json().assetQuestions[1]).toMatchObject({
        state: "answered",
        answer: "Use this recording",
        assetIds: [audioId],
      });
      expect(supplied.body).not.toContain("/tmp/sound.wav");
    } finally {
      server.store.delete(id);
    }
  });
  it("serves image attachment thumbnails without exposing documents or paths", async () => {
    const folder = await mkdtemp("/private/tmp/attachment-preview-");
    const imageId = randomUUID();
    const documentId = randomUUID();
    const imagePath = path.join(folder, "image.png");
    await sharp({ create: { width: 640, height: 480, channels: 3, background: "#446688" } })
      .png()
      .toFile(imagePath);
    server.store.asset({
      id: imageId,
      name: `${imageId}.png`,
      path: imagePath,
      kind: "image/png",
      bytes: 1,
    });
    server.store.asset({
      id: documentId,
      name: `${documentId}.txt`,
      path: imagePath,
      kind: "text/plain",
      bytes: 1,
    });
    try {
      const response = await server.app.inject({ url: `/api/assets/${imageId}/preview`, headers });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/webp");
      expect(await sharp(response.rawPayload).metadata()).toMatchObject({
        width: 320,
        height: 240,
      });
      for (const id of [documentId, randomUUID()])
        expect(
          (await server.app.inject({ url: `/api/assets/${id}/preview`, headers })).statusCode,
        ).toBe(404);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  it("accepts the configured web port and rejects the former development origin", async () => {
    for (const host of ["127.0.0.1", "localhost"]) {
      const allowed = await server.app.inject({
        url: "/api/setup",
        headers: { ...headers, origin: `http://${host}:${webPort}` },
      });
      expect(allowed.statusCode).toBe(200);
    }
    const rejected = await server.app.inject({
      url: "/api/setup",
      headers: { ...headers, origin: "http://127.0.0.1:5173" },
    });
    expect(rejected.statusCode).toBe(403);
  });
  it("restores attachment names and IDs without exposing local paths", async () => {
    const id = randomUUID();
    const assetId = randomUUID();
    server.store.asset({
      id: assetId,
      name: `${assetId}.png`,
      originalName: "reference.png",
      path: "/tmp/private-upload.png",
      kind: "image/png",
      bytes: 12,
    });
    server.store.save({
      id,
      createdAt: new Date().toISOString(),
      phase: "failed",
      request: RequestSchema.parse({ instructions: "Explain a generic idea", assetIds: [assetId] }),
      candidates: [],
      jobs: [],
    });
    try {
      const response = await server.app.inject({ url: `/api/runs/${id}/assets`, headers });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        assets: [{ id: assetId, originalName: "reference.png", bytes: 12 }],
      });
      expect(response.body).not.toContain("/tmp/private-upload.png");
    } finally {
      server.store.delete(id);
    }
  });
  it.each(["preparing", "generating", "ready", "cancelled", "failed"] as const)(
    "exposes model calls for %s projects without full generation or final usage",
    async (phase) => {
      const id = randomUUID();
      server.store.save({
        id,
        createdAt: new Date().toISOString(),
        phase,
        request: RequestSchema.parse({ instructions: "Explain a generic idea" }),
        candidates: [],
        jobs: [],
      });
      server.store.emit(id, "invocation", "Model invocation started", undefined, {
        provider: "claude",
        model: "claude-opus-5-5",
        purpose: "preview video generation",
        invocationId: randomUUID(),
      });
      try {
        const response = await server.app.inject({ url: "/api/admin/governance", headers });
        const project = response.json().projects.find((p: { id: string }) => p.id === id);
        expect(project.status).toBe(phase);
        expect(project.activity).toMatchObject([
          {
            model: "claude-opus-5-5",
            purpose: "preview video generation",
            calls: 1,
            inputTokens: null,
            outputTokens: null,
            costLow: null,
          },
        ]);
      } finally {
        server.store.delete(id);
      }
    },
  );
  it("keeps the project duration when a full-build request includes a legacy override", async () => {
    const id = randomUUID();
    const run: Run = {
      id,
      createdAt: new Date().toISOString(),
      phase: "ready",
      request: RequestSchema.parse({ instructions: "Explain a generic idea", duration: 30 }),
      candidates: [],
      jobs: [],
    };
    server.store.save(run);
    const full = vi.spyOn(server.workflow, "full").mockResolvedValue({
      id: "full-build",
      runId: id,
      candidateId: "direction",
      kind: "full",
      phase: "queued",
      workspace: "/tmp/example",
      model: "example-model",
      duration: 30,
    });
    try {
      const response = await server.app.inject({
        method: "POST",
        url: `/api/runs/${id}/full`,
        headers,
        payload: { candidateId: "direction", duration: 90 },
      });
      expect(response.statusCode).toBe(200);
      expect(server.store.get(id)?.request.duration).toBe(30);
      expect(full.mock.calls[0][0].request.duration).toBe(30);
    } finally {
      full.mockRestore();
      server.store.delete(id);
    }
  });
  it("offers project archives for failed jobs as soon as source files exist", async () => {
    const id = randomUUID();
    const jobId = randomUUID();
    const workspace = await mkdtemp(path.join(dataRoot, "export-api-"));
    const run: Run = {
      id,
      createdAt: new Date().toISOString(),
      phase: "failed",
      request: RequestSchema.parse({ instructions: "Explain a workflow" }),
      candidates: [],
      jobs: [
        {
          id: jobId,
          runId: id,
          candidateId: "candidate",
          kind: "full",
          phase: "failed",
          model: "claude-opus-5-5",
          createdAt: new Date().toISOString(),
          workspace,
          duration: 10,
        },
      ],
    };
    server.store.save(run);
    const url = `/api/projects/${id}/${jobId}`;
    try {
      expect((await server.app.inject({ url: `${url}/availability`, headers })).json()).toEqual({
        available: false,
      });
      expect((await server.app.inject({ url, headers })).statusCode).toBe(404);
      await writeFile(path.join(workspace, "shot.html"), "<canvas></canvas>");
      expect((await server.app.inject({ url: `${url}/availability`, headers })).json()).toEqual({
        available: true,
      });
      const response = await server.app.inject({ url, headers });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/zip");
      expect(unzipSync(response.rawPayload)["source/shot.html"]).toBeDefined();
    } finally {
      server.store.delete(id);
      await rm(workspace, { recursive: true, force: true });
    }
  });
  it("returns stable codes for missing projects and invalid requests", async () => {
    const missing = await server.app.inject({ url: `/api/runs/${randomUUID()}`, headers });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "PROJECT_NOT_FOUND" });
    const invalid = await server.app.inject({
      method: "DELETE",
      url: "/api/runs/invalid",
      headers,
    });
    expect(invalid.json()).toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("deletes a project through the browser request helper without an empty JSON body", async () => {
    const id = randomUUID();
    server.store.save({
      id,
      createdAt: new Date().toISOString(),
      phase: "ready",
      request: RequestSchema.parse({ instructions: "Verify project deletion" }),
      candidates: [],
      jobs: [],
    });
    vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
      const response = await server.app.inject({
        method: "DELETE",
        url,
        headers: { ...headers, ...Object.fromEntries(new Headers(options.headers)) },
      });
      return new Response(response.body, { status: response.statusCode });
    });
    try {
      await api(`/api/runs/${id}`, { method: "DELETE" });
      expect(server.store.get(id)).toBeUndefined();
      expect((await server.app.inject({ url: `/api/runs/${id}`, headers })).statusCode).toBe(404);
    } finally {
      vi.unstubAllGlobals();
      server.store.delete(id);
    }
  });
  it("deletes the cached project, event history and local artifacts, preserving other projects", async () => {
    const id = randomUUID();
    const otherId = randomUUID();
    const workspace = path.join(dataRoot, "runs", id);
    const run: Run = {
      id,
      createdAt: new Date().toISOString(),
      phase: "ready",
      request: RequestSchema.parse({ instructions: "Explain a generic workflow" }),
      candidates: [],
      jobs: [],
    };
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(workspace, "preview.mp4"), "test artifact");
    server.store.save(run);
    server.store.save({ ...run, id: otherId });
    server.store.emit(id, "state", "Done");
    server.store.emit(otherId, "state", "Retained");
    await server.app.inject({ url: `/api/runs/${id}`, headers });
    const response = await server.app.inject({ method: "DELETE", url: `/api/runs/${id}`, headers });
    expect(response.statusCode).toBe(200);
    expect(server.store.get(id)).toBeUndefined();
    expect(server.store.events(id)).toEqual([]);
    await expect(access(workspace)).rejects.toThrow();
    expect((await server.app.inject({ url: `/api/runs/${id}`, headers })).statusCode).toBe(404);
    expect(server.store.get(otherId)).toBeDefined();
    expect(server.store.events(otherId)).toHaveLength(1);
    expect(
      (await server.app.inject({ method: "DELETE", url: `/api/runs/${id}`, headers })).statusCode,
    ).toBe(404);
    server.store.delete(otherId);
  });
  it("stops active work before deletion and rejects unsafe requests", async () => {
    const id = randomUUID();
    const run: Run = {
      id,
      createdAt: new Date().toISOString(),
      phase: "generating",
      request: RequestSchema.parse({ instructions: "Explain a generic workflow" }),
      candidates: [],
      jobs: [],
    };
    server.store.save(run);
    const request = { method: "DELETE" as const, url: `/api/runs/${id}`, headers };
    expect((await server.app.inject(request)).statusCode).toBe(200);
    // Cancellation can finish the visible phase before the provider process exits.
    const active = vi.spyOn(server.workflow, "hasActiveTasks").mockReturnValue(true);
    const stoppedId = randomUUID();
    server.store.save({ ...run, id: stoppedId, phase: "cancelled" });
    expect(
      (await server.app.inject({ ...request, url: `/api/runs/${stoppedId}` })).statusCode,
    ).toBe(200);
    active.mockRestore();
    expect(
      (
        await server.app.inject({
          ...request,
          headers: { ...headers, origin: "https://example.com" },
        })
      ).statusCode,
    ).toBe(403);
    expect((await server.app.inject({ ...request, url: "/api/runs/not-a-uuid" })).statusCode).toBe(
      400,
    );
    expect(
      (await server.app.inject({ ...request, url: `/api/runs/${randomUUID()}` })).statusCode,
    ).toBe(404);
    expect(server.store.get(id)).toBeUndefined();
    expect(
      (await server.app.inject({ ...request, url: `/api/runs/${stoppedId}` })).statusCode,
    ).toBe(404);
    server.store.delete(id);
  });
  it("exposes current validated demos and explicit preparation status", async () => {
    const response = await server.app.inject({ url: "/api/examples", headers });
    expect(response.statusCode).toBe(200);
    for (const example of response.json().examples) {
      if (example.video) expect(example.motionStatus).toBe("ready");
      if (example.motionStatus === "needs_repair") expect(example.video).toBeUndefined();
    }
  });

  it("serves all styles and full metadata without leaking credentials", async () => {
    const response = await server.app.inject({ url: "/api/styles", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().styles).toHaveLength(141);
    const details = await server.app.inject({ url: "/api/styles/style-108", headers });
    expect(details.json().tech.style_renderer.recommended_stack_refs).toContain("Three.js");
    const setup = await server.app.inject({ url: "/api/setup", headers });
    expect(Object.keys(setup.json())).not.toContain("apiKey");
  });
  it("rejects foreign origins and invalid requests", async () => {
    const foreign = await server.app.inject({
      url: "/api/runs",
      method: "POST",
      headers: { ...headers, origin: "https://example.com" },
      payload: { instructions: "Explain a workflow" },
    });
    expect(foreign.statusCode).toBe(403);
    const invalid = await server.app.inject({
      url: "/api/runs",
      method: "POST",
      headers,
      payload: { instructions: "x" },
    });
    expect(invalid.statusCode).toBe(400);
  });
  it("serves ready pages in a script-enabled opaque sandbox and restricts resources to their workspace", async () => {
    const workspace = await mkdtemp(path.join(dataRoot, "page-api-test-"));
    try {
      await writeFile(
        path.join(workspace, "index.html"),
        "<!doctype html><title>Example</title><button>Explore</button>",
      );
      server.store.save({
        id: "page-test",
        createdAt: new Date().toISOString(),
        phase: "ready",
        request: RequestSchema.parse({ outputType: "page", instructions: "Explore a diagram" }),
        candidates: [],
        jobs: [
          {
            outputType: "page",
            id: "page-job",
            runId: "page-test",
            candidateId: "candidate",
            kind: "preview",
            phase: "ready",
            workspace,
            model: "test",
            page: "index.html",
          },
        ],
      });
      const response = await server.app.inject({
        url: "/api/pages/page-test/page-job/index.html",
        headers: { ...headers, origin: "null" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      const policy = String(response.headers["content-security-policy"]);
      expect(policy).toContain("sandbox allow-scripts");
      expect(policy).not.toContain("allow-same-origin");
      expect(policy).toContain("connect-src 'none'");
      expect(policy).toContain("/api/pages/page-test/page-job/");
      expect(response.headers["content-disposition"]).toBeUndefined();
      const blocked = await server.app.inject({
        url: "/api/runs",
        headers: { ...headers, origin: "null" },
      });
      expect(blocked.statusCode).toBe(403);
      const invalid = await server.app.inject({
        url: "/api/pages/page-test/page-job/../../jobs.sqlite",
        headers,
      });
      expect(invalid.statusCode).not.toBe(200);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
  it("does not expose arbitrary filesystem paths as artifacts", async () => {
    const bad = await server.app.inject({
      url: "/api/artifacts/unknown/job/%2e%2e%2fauth.json",
      headers,
    });
    expect(bad.statusCode).not.toBe(200);
  });
  it("never publishes GPT studies while Claude replacements are pending", async () => {
    const response = await server.app.inject({ url: "/api/examples", headers });
    for (const example of response.json().examples) {
      if (example.authorship === "application") {
        expect(example.model).toBe("application-authored");
        expect(example.provider).toBeUndefined();
      } else {
        if (example.source) expect(example.provider).toBe("claude");
        if (example.video) expect(example.model).toMatch(/^claude/);
      }
    }
  });
  it("serves a Claude illustrative image with the correct type", async () => {
    const response = await server.app.inject({ url: "/api/examples/style-001", headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/webp");
    expect(response.rawPayload.length).toBeGreaterThan(500);
  });
});

it("exposes governance inputs, settings and complete model activity only on the local API", async () => {
  const id = randomUUID();
  server.store.save({
    id,
    createdAt: "2026-10-11T00:00:00Z",
    phase: "ready",
    request: RequestSchema.parse({
      instructions: "Explain a generic governance example",
      provider: "claude",
      duration: 30,
      urls: ["https://example.com"],
    }),
    candidates: [],
    jobs: [],
  });
  server.store.emit(id, "usage", "Complete", undefined, {
    model: "claude-opus-5-5",
    purpose: "Brief preparation",
    invocationId: "one",
    usage: { input_tokens: 10, output_tokens: 5 },
    cost: 0.01,
  });
  const response = await server.app.inject({ url: "/api/admin/governance", headers });
  expect(response.statusCode).toBe(200);
  const project = response.json().projects.find((p: { id: string }) => p.id === id);
  expect(response.json().models).toContainEqual({
    function: "Brief preparation, Motion Graphic information extraction and generated lyrics",
    claude: "claude-haiku-5-5",
    codex: "gpt-6-luna",
  });
  expect(response.json().models).toContainEqual({
    function: "Motion Graphic combination proposals",
    claude: "claude-opus-5-5",
    codex: "gpt-6.1-sol",
  });
  expect(project.request).toMatchObject({
    duration: 30,
    urls: ["https://example.com"],
    provider: "claude",
  });
  expect(project.activity[0]).toMatchObject({
    model: "claude-opus-5-5",
    inputTokens: 10,
    outputTokens: 5,
    costLow: 0.01,
  });
  expect(JSON.stringify(response.json())).not.toContain("sessionId");
  expect(
    (await server.app.inject({ url: "/api/admin/governance", headers: { host: "example.com" } }))
      .statusCode,
  ).toBe(403);
  server.store.delete(id);
});

it("publishes saved reviewed motion previews after catalog metadata changes and serves their asset files", async () => {
  const listed = await server.app.inject({ url: "/api/examples", headers });
  const body = listed.json();
  const saved = body.examples.find(
    (example: { video?: string; catalogHash: string }) =>
      example.video && example.catalogHash !== body.catalogHash,
  );
  expect(saved).toBeDefined();
  expect(saved.motionStatus).toBe("ready");
  const response = await server.app.inject({
    url: `/api/examples/${saved.styleId}/video`,
    headers: { ...headers, range: "bytes=0-1023" },
  });
  expect(response.statusCode).toBe(206);
  expect(saved.video).toMatch(/\.webm$/);
  expect(response.headers["content-type"]).toContain("video/webm");
  expect(response.rawPayload.length).toBe(1024);
  expect(response.headers["content-range"]).toMatch(/^bytes 0-1023\//);
  const source = await server.app.inject({ url: `/api/examples/${saved.styleId}/source`, headers });
  expect(source.statusCode).toBe(200);
});

it("validates manual styles before preparation and routes regeneration and refinement explicitly", async () => {
  for (const payload of [
    { candidateCount: 0 },
    { candidateCount: 0, selectedStyleIds: ["style-999"] },
    {
      candidateCount: 0,
      duration: 15,
      selectedStyleIds: ["style-001", "style-002", "style-003", "style-004"],
    },
  ]) {
    const response = await server.app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: { instructions: "Explain a generic idea", ...payload },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_REQUEST");
  }
  const id = randomUUID();
  const run: Run = {
    id,
    createdAt: new Date().toISOString(),
    phase: "ready",
    request: RequestSchema.parse({ instructions: "Explain a generic idea", candidateCount: 3 }),
    candidates: [],
    jobs: [],
  };
  server.store.save(run);
  const regenerate = vi.spyOn(server.workflow, "regenerateDirections").mockResolvedValue(undefined);
  const refine = vi.spyOn(server.workflow, "refineVideo").mockResolvedValue({
    id: "revision",
    runId: id,
    candidateId: "chosen",
    kind: "full",
    phase: "queued",
    workspace: "/tmp/unused",
    model: "test",
    duration: 30,
    sourceJobId: "source",
  });
  try {
    const regeneration = await server.app.inject({
      method: "POST",
      url: `/api/runs/${id}/directions`,
      headers,
      payload: { candidateCount: 5 },
    });
    expect(regeneration.statusCode).toBe(202);
    expect(regenerate.mock.calls[0][0].request.candidateCount).toBe(3);
    const invalid = await server.app.inject({
      method: "POST",
      url: `/api/runs/${id}/refine`,
      headers,
      payload: { jobId: "source", prompt: " " },
    });
    expect(invalid.statusCode).toBe(400);
    expect(refine).not.toHaveBeenCalled();
    const revision = await server.app.inject({
      method: "POST",
      url: `/api/runs/${id}/refine`,
      headers,
      payload: { jobId: "source", prompt: " Bigger captions " },
    });
    expect(revision.statusCode).toBe(202);
    expect(refine.mock.calls[0].slice(1)).toEqual(["source", "Bigger captions"]);
  } finally {
    regenerate.mockRestore();
    refine.mockRestore();
    server.store.delete(id);
  }
});

it("rejects an unverified Windows setup before saving or starting generation", async () => {
  const count = server.store.list().length;
  const readiness = vi
    .spyOn(nativeReadiness, "assertWindowsRenderReady")
    .mockRejectedValueOnce(
      new CodedError("INVALID_REQUEST", "Native Windows setup needs its local check."),
    );
  const prepare = vi.spyOn(server.workflow, "prepare").mockResolvedValue(undefined);
  try {
    const response = await server.app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: { instructions: "Explain a simple idea", assetIds: [] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_REQUEST");
    expect(server.store.list()).toHaveLength(count);
    expect(prepare).not.toHaveBeenCalled();
  } finally {
    readiness.mockRestore();
    prepare.mockRestore();
  }
});
