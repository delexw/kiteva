import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { validStoryboard } from "./fixtures/storyboard";
import { videoBuildPlanSchemaFor } from "../src/shared/agents/schemas/video-build-plan";
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
it.each(["full", "claude", "otherModel", "refinement"])(
  "leaves %s on the existing path",
  async (kind) => {
    const options = await input();
    if (kind === "full") options.job.kind = "full";
    if (kind === "otherModel") options.job.model = "gpt-6-astra";
    if (kind === "refinement") options.job.refinementPrompt = "Larger captions";
    const provider = kind === "claude" ? ("claude" as const) : options.provider;
    expect(needsVideoBuildPlan(options.job, provider)).toBe(false);
    const prompt = await prepareVideoBuildPlan({ ...options, provider });
    if (kind === "full") expect(prompt).toContain("selected preview's latest model session");
    else expect(prompt).toBe(options.prompt);
    expect(agentTurn).not.toHaveBeenCalled();
  },
);
it("does not hand off malformed plans or a missing session", async () => {
  const options = await input();
  vi.mocked(agentTurn).mockResolvedValueOnce({ value: {}, sessionId: "session" });
  await expect(prepareVideoBuildPlan(options)).rejects.toThrow();
  expect(options.job.buildPlan).toBeUndefined();
  vi.mocked(agentTurn).mockResolvedValueOnce({ value: validPlan() });
  await expect(prepareVideoBuildPlan(options)).rejects.toThrow("disconnected build");
});

it("runs planning then implementation in one selected session before rendering", async () => {
  const { generateVideo } = await import("../src/server/domains/video/workflow");
  const { loadCatalog } = await import("../src/server/catalog/catalog");
  const { VideoRequestSchema } = await import("../src/shared/domains/video");
  const options = await input();
  const controller = new AbortController();
  const previewPlan = { ...validPlan(), width: 1280, height: 720 };
  const production = {
    pipeline: "HyperFrames",
    fallbackReason: null,
    styleRenderer: ["HTML/CSS"],
    motionEngine: ["GSAP"],
    sourceFile: "index.html",
    duration: 3,
    width: 1280,
    height: 720,
    fps: 60,
    displayTitle: "An idea",
    displayDescription: "An idea appears",
    audioDescription: "Silent",
    limitations: [],
    storyboard: validStoryboard(3),
  };
  vi.mocked(agentTurn)
    .mockImplementationOnce(async (call) => {
      expect(call.prompt).toContain("GPT-6.1 VIDEO PRODUCTION PRINCIPLES");
      return { value: previewPlan, sessionId: "planning-session" };
    })
    .mockImplementationOnce(async (call) => {
      expect(call.sessionId).toBe("planning-session");
      expect(call.readOnly).toBeUndefined();
      expect(call.model).toBe("gpt-6.1-sol");
      expect(call.prompt).toContain("IMPLEMENT THE SAVED VIDEO BUILD PLAN");
      expect(call.prompt).toContain("GPT-6.1 VIDEO PRODUCTION PRINCIPLES");
      expect(call.schema.parse(production)).toMatchObject({ storyboard: validStoryboard(3) });
      return { value: production, sessionId: "planning-session" };
    });
  await expect(
    generateVideo({
      job: options.job,
      request: VideoRequestSchema.parse({
        instructions: "Show an idea",
        provider: "codex",
        frameRate: 60,
        duration: 3,
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
        suggestedDuration: 3,
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
  expect(
    await readFile(path.join(options.job.workspace, "EXECUTABLE_PROMPT.md"), "utf8"),
  ).toContain("IMPLEMENT THE SAVED VIDEO BUILD PLAN");
});

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

it("does not re-plan a full video, including legacy previews, and requires their saved session", async () => {
  const options = await input();
  options.job.kind = "full";
  options.job.duration = 300;
  const prompt = await prepareVideoBuildPlan(options);
  expect(prompt).toContain("selected preview's latest model session");
  expect(prompt).toContain("not its three-second timing");
  expect(agentTurn).not.toHaveBeenCalled();
  options.job.sessionId = undefined;
  await expect(prepareVideoBuildPlan(options)).rejects.toThrow("selected preview's saved session");
  expect(agentTurn).not.toHaveBeenCalled();
});

it("ignores retired style-contract metadata when resuming a saved Claude job", async () => {
  const options = await input();
  Object.assign(options.job, { styleContract: { fingerprint: "retired-policy", value: {} } });
  expect(needsVideoBuildPlan(options.job, "claude")).toBe(false);
  expect(await prepareVideoBuildPlan({ ...options, provider: "claude" })).toBe(options.prompt);
  expect(agentTurn).not.toHaveBeenCalled();
});
