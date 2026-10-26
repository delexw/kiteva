import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { validStoryboard } from "./fixtures/storyboard";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
import { BriefSchema } from "../src/shared/agents/schemas/video";
import type { StyleCandidate } from "../src/shared/contracts";
import { loadCatalog } from "../src/server/catalog/catalog";
import { writePreviewPlan } from "../src/server/jobs/preview-plan";
import { writeProjectRequest } from "../src/server/requests/project-request";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/rendering/render", () => ({ renderJob: vi.fn(async () => ({})) }));
import { agentTurn } from "../src/server/agents/providers";
import { generateVideo } from "../src/server/domains/video/workflow";

it.each(
  (["claude", "codex"] as const).flatMap((provider) =>
    (["selected", "automatic", "random", "legacy"] as const).flatMap((route) =>
      (["hyperframes", "multiplane"] as const).map((renderer) => ({ provider, route, renderer })),
    ),
  ),
)(
  "$provider $route $renderer builds N directions from files in new independent sessions",
  async ({ provider, route, renderer }) => {
    vi.mocked(agentTurn).mockReset();
    const root = await mkdtemp(path.join(os.tmpdir(), "preview builds "));
    try {
      const catalog = await loadCatalog();
      const request = VideoRequestSchema.parse({
        instructions: "Explain an example product",
        provider,
        renderer,
        preference: route === "random" ? "random" : "creative",
        candidateCount: 2,
        ...(route === "selected" ? { selectedStyleIds: [catalog.styles[0].id] } : {}),
      });
      const brief = BriefSchema.parse({
        subject: "Example product",
        audience: "New users",
        objective: "Explain",
        facts: [],
        exactCopy: [],
        previewBeat: "Source becomes a result",
        assetDescriptions: [],
        constraints: [],
        suggestedDuration: 30,
        durationReason: "A demonstration",
      });
      const directions: StyleCandidate[] = [0, 1].map((index) => ({
        id: `direction-${index}`,
        primaryStyleId: catalog.styles[route === "selected" ? 0 : index].id,
        supportingStyleIds: [],
        sceneRoles: [`Execution ${index}`],
        rationale: `Approach ${index}`,
        feasible: true,
        missingAssets: [],
        score: 0,
        confidence: 0,
        dimensions: {},
      }));
      const sharedFile = await writePreviewPlan(root, brief, directions);
      expect(JSON.parse(await readFile(sharedFile, "utf8")).directions).toEqual(directions);
      const jobs: VideoGenerationJob[] = directions.map((direction) => ({
        id: direction.id,
        candidateId: direction.id,
        runId: "example",
        kind: "preview",
        phase: "queued",
        model: "selected-main",
        duration: 3,
        workspace: path.join(root, direction.id),
      }));
      for (const [index, job] of jobs.entries()) {
        if (route === "legacy") {
          job.sessionId = "old-planning-session";
          job.buildPlan = {
            model: job.model,
            sessionId: "old-planning-session",
            value: {
              version: 2,
              width: 1280,
              height: 720,
              fps: 30,
              durationSeconds: 3,
              plan: "Legacy preview plan",
              capturePlan: null,
              storyboard: validStoryboard(3),
            },
          };
        }
        await mkdir(job.workspace, { recursive: true });
        await writeProjectRequest(job.workspace, request);
        await writePreviewPlan(job.workspace, brief, [directions[index]]);
      }
      vi.mocked(agentTurn).mockImplementation(async (call) => {
        expect(call.sessionId).toBeUndefined();
        expect(call.readOnly).toBeUndefined();
        expect(call.planMode).toBeUndefined();
        expect(call.prompt).toContain("# Build this preview");
        expect(call.prompt).not.toContain("VIDEO BUILD PLAN");
        const planFile = path.resolve(call.workspace, "PREVIEW_PLAN.json");
        expect(call.prompt).toContain(JSON.stringify(planFile));
        const plan = JSON.parse(await readFile(planFile, "utf8"));
        const direction = directions.find((entry) => call.workspace === path.join(root, entry.id))!;
        expect(plan.directions).toEqual([direction]);
        expect(plan.brief.previewBeat).toBe(brief.previewBeat);
        expect(
          await readFile(path.resolve(call.workspace, "VIDEO_REQUIREMENTS.md"), "utf8"),
        ).toContain(request.instructions);
        return {
          sessionId: `build-${direction.id}`,
          value: {
            pipeline: renderer === "multiplane" ? "Multiplane" : "HyperFrames",
            fallbackReason: null,
            sourceFile: "index.html",
            styleRenderer: ["HTML/CSS"],
            motionEngine: ["GSAP"],
            duration: 3,
            width: 1280,
            height: 720,
            fps: 30,
            audioDescription: "Silent",
            limitations: [],
            displayTitle: direction.id,
            displayDescription: "A source becomes a result",
            storyboard: validStoryboard(3),
          },
        };
      });
      await Promise.all(
        jobs.map((job, index) =>
          generateVideo({
            job,
            request,
            brief,
            candidate: directions[index],
            styles: catalog.styles,
            signal: new AbortController().signal,
            onEvent: vi.fn(),
            update: vi.fn(),
            emit: vi.fn(),
            render: async (task) => task(),
          }),
        ),
      );
      expect(agentTurn).toHaveBeenCalledTimes(2);
      expect(jobs.map((job) => job.phase)).toEqual(["ready", "ready"]);
      expect(new Set(jobs.map((job) => job.sessionId)).size).toBe(2);
      expect(jobs.every((job) => job.buildPlan === undefined)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
