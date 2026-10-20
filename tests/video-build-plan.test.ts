import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { validStoryboard } from "./fixtures/storyboard";
import {
  fullVideoPlanSchemaFor,
  videoBuildPlanSchemaFor,
} from "../src/shared/agents/schemas/video-build-plan";
import type { VideoGenerationJob } from "../src/shared/domains/video";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import { prepareVideoBuildPlan, needsVideoBuildPlan } from "../src/server/domains/video/build-plan";

const size = { duration: 3, width: 1920, height: 1080, fps: 60 };
function validPlan() {
  return {
    version: 1,
    width: size.width,
    height: size.height,
    fps: size.fps,
    storyboard: validStoryboard(3),
    assets: [],
    sceneGuidance: [
      {
        sceneId: "scene-1",
        composition: "Central title with clear margins",
        camera: "Static camera",
        layers: [
          {
            id: "title",
            role: "Heading",
            appearance: "Dark ink",
            placement: "Center with 10% safe margins",
          },
        ],
        motions: [
          {
            targetLayerId: "title",
            property: "opacity",
            from: "0",
            to: "1",
            startSeconds: 0,
            endSeconds: 1,
            easing: "power2.out",
            implementation: "GSAP fromTo opacity",
          },
        ],
        transition: { startSeconds: 3, endSeconds: 3, description: "End on the settled title" },
        readingHolds: [
          {
            startSeconds: 1,
            endSeconds: 3,
            textLayerIds: ["title"],
            reason: "Read the short heading",
          },
        ],
        audioCues: [],
        verification: ["Heading fits without clipping"],
      },
    ],
    tools: [{ name: "GSAP", responsibility: "Seekable opacity" }],
    acceptanceChecks: ["Seeking backward reproduces the frame"],
  };
}
function fullPlan(duration = 3, width = size.width, height = size.height) {
  return {
    version: 2 as const,
    width,
    height,
    fps: size.fps,
    durationSeconds: duration,
    plan: "Goal: explain the main workflow. Inspect the app, then record creation, review and viewing in one connected story. Estimated act timing must be reconciled with real footage. Keep music continuous across scene boundaries and verify the final storyboard after implementation.",
  };
}
function job(workspace = "/job"): VideoGenerationJob {
  return {
    id: "preview",
    runId: "project",
    candidateId: "direction",
    kind: "preview",
    phase: "generating",
    duration: 3,
    workspace,
    model: "gpt-6.1-sol",
    sessionId: "preview-session",
  };
}
const folders: string[] = [];
afterEach(async () => {
  vi.mocked(agentTurn).mockReset();
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function input() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "video-build-plan-"));
  folders.push(workspace);
  return {
    job: job(workspace),
    provider: "codex" as const,
    prompt: "Read style-context.json; preserve exact text",
    ...size,
    signal: new AbortController().signal,
    onEvent: vi.fn(),
    update: vi.fn(),
  };
}
it("constrains SDK dimensions and duration with literal schema values", () => {
  const schema = videoBuildPlanSchemaFor(size);
  expect(schema.parse(validPlan())).toMatchObject({ width: 1920, height: 1080, fps: 60 });
  const json = z.toJSONSchema(schema);
  expect(json.properties?.width).toMatchObject({ const: 1920 });
  expect(json.properties?.fps).toMatchObject({ const: 60 });
  expect(() => schema.parse({ ...validPlan(), fps: 30 })).toThrow();
});
it.each(["target", "time", "missingScene", "duplicateScene", "duplicateLayer", "hold"])(
  "rejects broken plan references or timings: %s",
  (defect) => {
    const plan = validPlan();
    const scene = plan.sceneGuidance[0];
    if (defect === "target") scene.motions[0].targetLayerId = "unknown";
    if (defect === "time") scene.motions[0].endSeconds = 4;
    if (defect === "missingScene") scene.sceneId = "missing";
    if (defect === "duplicateScene") plan.sceneGuidance.push(structuredClone(scene));
    if (defect === "duplicateLayer") scene.layers.push(structuredClone(scene.layers[0]));
    if (defect === "hold") scene.readingHolds[0].textLayerIds = ["unknown"];
    expect(() => videoBuildPlanSchemaFor(size).parse(plan)).toThrow();
  },
);
it("plans in the selected preview session, persists it and hands off in the returned session", async () => {
  const options = await input();
  vi.mocked(agentTurn).mockImplementationOnce(async (call) => {
    call.onEvent({
      type: "usage",
      message: "Plan complete",
      data: { invocationId: "plan", usage: { input_tokens: 10, output_tokens: 5 } },
    });
    return { value: validPlan(), sessionId: "same-session" };
  });
  const prompt = await prepareVideoBuildPlan(options);
  const call = vi.mocked(agentTurn).mock.calls[0][0];
  expect(call).toMatchObject({
    model: "gpt-6.1-sol",
    readOnly: true,
    sessionId: "preview-session",
  });
  expect(call.prompt).toContain("explicit from/to values with units");
  expect(call.prompt).toContain(options.prompt);
  expect(call.prompt).toContain("specify only the representative preview beat");
  expect(options.job.sessionId).toBe("same-session");
  expect(options.job.buildPlan?.sessionId).toBe("same-session");
  expect(prompt).toContain("Read VIDEO_BUILD_PLAN.json completely");
  expect(
    JSON.parse(await readFile(path.join(options.job.workspace, "VIDEO_BUILD_PLAN.json"), "utf8")),
  ).toEqual(validPlan());
  expect(options.onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "usage",
      data: expect.objectContaining({ videoBuildPlanning: true }),
    }),
  );
  expect(options.update).toHaveBeenCalled();
  expect(options.job.generationMs).toBeGreaterThanOrEqual(0);
});
it("reuses the validated checkpoint on retries without spending another planning call", async () => {
  const options = await input();
  vi.mocked(agentTurn).mockResolvedValueOnce({ value: validPlan(), sessionId: "same-session" });
  await prepareVideoBuildPlan(options);
  options.job = JSON.parse(JSON.stringify(options.job));
  await prepareVideoBuildPlan(options);
  expect(agentTurn).toHaveBeenCalledTimes(1);
});
it("rejects a cached plan from another model session", async () => {
  const options = await input();
  vi.mocked(agentTurn).mockResolvedValueOnce({ value: validPlan(), sessionId: "same-session" });
  await prepareVideoBuildPlan(options);
  options.job.sessionId = "different-session";
  await expect(prepareVideoBuildPlan(options)).rejects.toThrow("does not belong");
  expect(agentTurn).toHaveBeenCalledTimes(1);
});
it.each(["claude", "otherModel", "refinement"])("leaves %s on the existing path", async (kind) => {
  const options = await input();
  if (kind === "otherModel") options.job.model = "gpt-6-astra";
  if (kind === "refinement") options.job.refinementPrompt = "Larger captions";
  const provider = kind === "claude" ? ("claude" as const) : options.provider;
  expect(needsVideoBuildPlan(options.job, provider)).toBe(false);
  const prompt = await prepareVideoBuildPlan({ ...options, provider });
  expect(prompt).toBe(options.prompt);
  expect(agentTurn).not.toHaveBeenCalled();
});
it("does not hand off malformed plans or a missing session", async () => {
  const options = await input();
  vi.mocked(agentTurn).mockResolvedValueOnce({ value: {}, sessionId: "session" });
  await expect(prepareVideoBuildPlan(options)).rejects.toThrow();
  expect(options.job.buildPlan).toBeUndefined();
  vi.mocked(agentTurn).mockResolvedValueOnce({ value: validPlan() });
  await expect(prepareVideoBuildPlan(options)).rejects.toThrow("disconnected build");
});

it.each([
  ["codex", "preview"],
  ["codex", "full"],
  ["claude", "full"],
  ["codex", "automatic"],
  ["claude", "automatic"],
] as const)(
  "runs %s %s planning then implementation in one selected session before rendering",
  async (provider, mode) => {
    const automatic = mode === "automatic";
    const kind = automatic ? "full" : mode;
    const duration = automatic ? 90 : 3;
    const { generateVideo } = await import("../src/server/domains/video/workflow");
    const { loadCatalog } = await import("../src/server/catalog/catalog");
    const { VideoRequestSchema } = await import("../src/shared/domains/video");
    const options = await input();
    const controller = new AbortController();
    options.job.kind = kind;
    if (automatic) {
      options.job.duration = 15;
      options.job.sessionId = undefined;
    }
    options.job.model = provider === "claude" ? "claude-opus-5-5" : "gpt-6.1-sol";
    const width = kind === "preview" ? 1280 : 1920;
    const height = kind === "preview" ? 720 : 1080;
    const previewPlan =
      kind === "preview" ? { ...validPlan(), width, height } : fullPlan(duration, width, height);
    const production = {
      pipeline: "HyperFrames",
      fallbackReason: null,
      styleRenderer: ["HTML/CSS"],
      motionEngine: ["GSAP"],
      sourceFile: "index.html",
      duration,
      width,
      height,
      fps: 60,
      displayTitle: "An idea",
      displayDescription: "An idea appears",
      audioDescription: "Silent",
      limitations: [],
      storyboard: validStoryboard(duration),
    };
    vi.mocked(agentTurn)
      .mockImplementationOnce(async (call) => {
        expect(call.readOnly).toBe(true);
        expect(call.referenceUrls).toEqual(["https://example.com/app"]);
        expect(call.model).toBe(options.job.model);
        return { value: previewPlan, sessionId: "planning-session" };
      })
      .mockImplementationOnce(async (call) => {
        expect(call.sessionId).toBe("planning-session");
        expect(call.readOnly).toBeUndefined();
        expect(call.model).toBe(options.job.model);
        expect(call.prompt).toContain("IMPLEMENT THE SAVED VIDEO BUILD PLAN");
        expect(call.schema.parse(production)).toMatchObject({
          storyboard: validStoryboard(duration),
        });
        return { value: production, sessionId: "planning-session" };
      });
    await expect(
      generateVideo({
        job: options.job,
        request: VideoRequestSchema.parse({
          instructions: "Show an idea",
          provider,
          urls: ["https://example.com/app"],
          frameRate: 60,
          duration: automatic ? "auto" : duration,
          ...(automatic ? { selectedStyleIds: ["style-018"], candidateCount: 0 } : {}),
        }),
        brief: {
          subject: "An idea",
          audience: "Creators",
          objective: "Explain",
          facts: [],
          exactCopy: [],
          previewBeat: "An idea appears",
          assetDescriptions: [],
          constraints: [],
          suggestedDuration: duration,
          durationReason: "Short example",
        },
        candidate: {
          id: "direction",
          primaryStyleId: "style-018",
          supportingStyleIds: [],
          sceneRoles: [],
          rationale: "Clarity",
          feasible: true,
          missingAssets: [],
          score: 90,
          confidence: 0.9,
          dimensions: {},
        },
        styles: (await loadCatalog()).styles,
        signal: controller.signal,
        update: options.update,
        onEvent: options.onEvent,
        emit: vi.fn(),
        render: async () => {
          controller.abort(new Error("verified before render"));
          throw controller.signal.reason;
        },
      }),
    ).rejects.toThrow("verified before render");
    expect(agentTurn).toHaveBeenCalledTimes(2);
    expect(options.job.sessionId).toBe("planning-session");
    expect(options.job.duration).toBe(duration);
    expect(
      await readFile(path.join(options.job.workspace, "EXECUTABLE_PROMPT.md"), "utf8"),
    ).toContain("IMPLEMENT THE SAVED VIDEO BUILD PLAN");
  },
);

it("starts each new preview with its own planning session and labels every planning event", async () => {
  const options = await input();
  options.job.sessionId = undefined;
  vi.mocked(agentTurn).mockImplementationOnce(async (call) => {
    expect(call.sessionId).toBeUndefined();
    call.onEvent({
      type: "session",
      message: "Session opened",
      data: { sessionId: "direction-session" },
    });
    call.onEvent({ type: "invocation", message: "Planning", data: { invocationId: "plan-call" } });
    return { value: validPlan(), sessionId: "direction-session" };
  });
  await prepareVideoBuildPlan(options);
  expect(options.job.sessionId).toBe("direction-session");
  expect(
    options.onEvent.mock.calls.every(([event]) => event.data.videoBuildPlanning === true),
  ).toBe(true);
});

it.each(["claude", "codex"] as const)(
  "plans a full film with %s, including direct builds without a preview session",
  async (provider) => {
    const options = await input();
    options.job.kind = "full";
    options.job.duration = 300;
    options.job.model = provider === "claude" ? "claude-opus-5-5" : "gpt-6.1-sol";
    options.job.sessionId = undefined;
    const plan = fullPlan(300);
    vi.mocked(agentTurn).mockResolvedValueOnce({ value: plan, sessionId: "full-plan-session" });
    const referenceUrls = ["https://example.com/app"];
    const prompt = await prepareVideoBuildPlan({ ...options, provider, referenceUrls });
    expect(agentTurn).toHaveBeenCalledOnce();
    expect(vi.mocked(agentTurn).mock.calls[0][0]).toMatchObject({
      provider,
      model: options.job.model,
      readOnly: true,
      planMode: provider === "claude",
      referenceUrls,
    });
    const planningPrompt = vi.mocked(agentTurn).mock.calls[0][0].prompt;
    expect(planningPrompt).toContain("Plan the complete requested film at its full duration");
    expect(planningPrompt).toContain("inspect the live application using the reference tools");
    expect(planningPrompt).toContain("never claim planned footage already exists");
    expect(planningPrompt).not.toContain("specify only the representative preview beat");
    expect(prompt).toContain("Implement the complete film now");
    expect(options.job.sessionId).toBe("full-plan-session");
    expect(options.job.buildPlan?.value).toMatchObject({ version: 2, durationSeconds: 300 });
    await prepareVideoBuildPlan({ ...options, provider, referenceUrls });
    expect(agentTurn).toHaveBeenCalledOnce();
  },
);

it("ignores retired style-contract metadata when resuming a saved Claude job", async () => {
  const options = await input();
  Object.assign(options.job, { styleContract: { fingerprint: "retired-policy", value: {} } });
  expect(needsVideoBuildPlan(options.job, "claude")).toBe(false);
  expect(await prepareVideoBuildPlan({ ...options, provider: "claude" })).toBe(options.prompt);
  expect(agentTurn).not.toHaveBeenCalled();
});

it("uses a narrative full-film plan without premature scene-local choreography validation", () => {
  const plan = fullPlan(180);
  expect(fullVideoPlanSchemaFor({ ...size, duration: 180 }).parse(plan)).toEqual(plan);
  expect(() => fullVideoPlanSchemaFor(size).parse(plan)).toThrow();
  expect(() =>
    fullVideoPlanSchemaFor({ ...size, duration: 180 }).parse({ ...plan, plan: " " }),
  ).toThrow();
});

it.each(["claude", "codex"] as const)(
  "lets the %s main planner choose automatic duration and reuses that plan",
  async (provider) => {
    const options = await input();
    options.job.kind = "full";
    options.job.duration = 15;
    options.job.sessionId = undefined;
    options.job.model = provider === "claude" ? "claude-opus-5-5" : "gpt-6.1-sol";
    vi.mocked(agentTurn).mockImplementationOnce(async (call) => {
      expect(call.schema.safeParse(fullPlan(1)).success).toBe(false);
      expect(call.schema.safeParse(fullPlan(301)).success).toBe(false);
      expect(call.prompt).toContain("duration in the next-turn specification is provisional");
      return { value: fullPlan(90), sessionId: "auto-main-plan" };
    });
    await prepareVideoBuildPlan({ ...options, provider, automaticDuration: true });
    expect(options.job.duration).toBe(90);
    expect(options.job.buildPlan?.value).toMatchObject({ durationSeconds: 90 });
    await prepareVideoBuildPlan({ ...options, provider });
    expect(agentTurn).toHaveBeenCalledOnce();
  },
);
