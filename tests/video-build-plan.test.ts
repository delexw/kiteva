import { StoryboardSchema } from "../src/shared/agents/schemas/storyboard";
import { ProductionSchema } from "../src/shared/agents/schemas/video";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
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
import { StructuredOutputError } from "../src/server/agents/structured-output-error";

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
    storyboard: validStoryboard(duration),
    capturePlan: null,
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
  expect(call.includeCreativeAlternatives).toBe(false);
  expect(call).toMatchObject({
    model: "gpt-6.1-sol",
    readOnly: true,
    sessionId: "preview-session",
  });
  expect(call.prompt).not.toContain(options.prompt);
  expect(call.prompt).toContain(
    JSON.stringify(path.resolve(options.job.workspace, "VIDEO_REQUIREMENTS.md")),
  );
  expect(await readFile(path.join(options.job.workspace, "VIDEO_REQUIREMENTS.md"), "utf8")).toBe(
    options.prompt,
  );
  const guidance = await readFile(
    path.join(options.job.workspace, "VIDEO_PLANNING_GUIDANCE.md"),
    "utf8",
  );
  expect(guidance).toContain("explicit from/to values with units");
  expect(guidance).toContain("specify only the representative preview beat");
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
  expect(options.onEvent.mock.calls.filter(([event]) => event.type === "plan_ready")).toHaveLength(
    1,
  );
});
it("rejects a cached plan from another model session", async () => {
  const options = await input();
  vi.mocked(agentTurn).mockResolvedValueOnce({ value: validPlan(), sessionId: "same-session" });
  await prepareVideoBuildPlan(options);
  options.job.sessionId = "different-session";
  await expect(prepareVideoBuildPlan(options)).rejects.toThrow("does not belong");
  expect(agentTurn).toHaveBeenCalledTimes(1);
});
it.each(["claude", "codex"] as const)(
  "keeps %s refinements on their focused repair path",
  async (provider) => {
    const options = await input();
    options.job.refinementPrompt = "Larger captions";
    expect(needsVideoBuildPlan(options.job)).toBe(false);
    const prompt = await prepareVideoBuildPlan({ ...options, provider });
    expect(prompt).toBe(options.prompt);
    expect(agentTurn).not.toHaveBeenCalled();
  },
);
it("does not hand off malformed plans or a missing session", async () => {
  const options = await input();
  vi.mocked(agentTurn).mockResolvedValue({ value: {}, sessionId: "session" });
  await expect(prepareVideoBuildPlan(options)).rejects.toThrow();
  expect(options.job.buildPlan).toBeUndefined();
  vi.mocked(agentTurn).mockResolvedValueOnce({ value: validPlan() });
  await expect(prepareVideoBuildPlan(options)).rejects.toThrow("disconnected build");
});

it.each(["claude", "codex"] as const)(
  "corrects rejected layer references and timing in the same %s session before saving",
  async (provider) => {
    const options = await input();
    options.job.model = provider === "claude" ? "claude-opus-5-5" : "gpt-6.1-sol";
    options.job.sessionId = undefined;
    const invalid = validPlan();
    invalid.sceneGuidance[0].readingHolds[0].textLayerIds = ["missing-title"];
    invalid.sceneGuidance[0].motions[0].endSeconds = 4;
    const validation = videoBuildPlanSchemaFor(size).safeParse(invalid);
    if (validation.success) throw Error("Expected invalid fixture");
    vi.mocked(agentTurn)
      .mockRejectedValueOnce(new StructuredOutputError(validation.error, invalid, "owning-session"))
      .mockResolvedValueOnce({ value: validPlan(), sessionId: "owning-session" });
    const prompt = await prepareVideoBuildPlan({ ...options, provider });
    expect(agentTurn).toHaveBeenCalledTimes(2);
    const correction = vi.mocked(agentTurn).mock.calls[1][0];
    expect(correction).toMatchObject({
      sessionId: "owning-session",
      provider,
      model: options.job.model,
      readOnly: true,
      planMode: provider === "claude",
    });
    expect(correction.prompt).toContain("Reading holds must refer to declared layers");
    expect(correction.prompt).toContain("Timing must lie within its scene");
    expect(correction.prompt).toContain("missing-title");
    expect(prompt).toContain("IMPLEMENT THE SAVED VIDEO BUILD PLAN");
    expect(options.job.buildPlan?.sessionId).toBe("owning-session");
    expect(
      JSON.parse(await readFile(path.join(options.job.workspace, "VIDEO_BUILD_PLAN.json"), "utf8")),
    ).toEqual(validPlan());
    expect(
      options.onEvent.mock.calls.filter(([event]) => event.type === "plan_ready"),
    ).toHaveLength(1);
  },
);

it("never saves or hands off a repeatedly invalid plan", async () => {
  const options = await input();
  const invalid = {};
  const validation = videoBuildPlanSchemaFor(size).safeParse(invalid);
  if (validation.success) throw Error("Expected invalid fixture");
  vi.mocked(agentTurn).mockRejectedValue(
    new StructuredOutputError(validation.error, invalid, "owning-session"),
  );
  await expect(prepareVideoBuildPlan(options)).rejects.toBeInstanceOf(StructuredOutputError);
  expect(agentTurn).toHaveBeenCalledTimes(3);
  expect(options.job.buildPlan).toBeUndefined();
  await expect(
    readFile(path.join(options.job.workspace, "VIDEO_BUILD_PLAN.json")),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(options.onEvent.mock.calls.some(([event]) => event.type === "plan_ready")).toBe(false);
});

it("does not retry cancellation or unrelated provider failures as plan corrections", async () => {
  const options = await input();
  const error = new Error("Provider unavailable");
  vi.mocked(agentTurn).mockRejectedValueOnce(error);
  await expect(prepareVideoBuildPlan(options)).rejects.toBe(error);
  expect(agentTurn).toHaveBeenCalledOnce();
  vi.mocked(agentTurn).mockReset();
  const controller = new AbortController();
  vi.mocked(agentTurn).mockImplementationOnce(async () => {
    controller.abort(new Error("User stopped work"));
    throw error;
  });
  await expect(prepareVideoBuildPlan({ ...options, signal: controller.signal })).rejects.toThrow(
    "User stopped work",
  );
  expect(agentTurn).toHaveBeenCalledOnce();
});

it.each([
  ["codex", "preview"],
  ["claude", "preview"],
  ["codex", "selected-preview"],
  ["claude", "selected-preview"],
  ["codex", "direct"],
  ["claude", "direct"],
  ["codex", "full"],
  ["claude", "full"],
  ["codex", "automatic"],
  ["claude", "automatic"],
  ["codex", "refinement"],
  ["claude", "refinement"],
  ["codex", "refinement-resume"],
  ["claude", "refinement-resume"],
] as const)(
  "runs %s %s with independent preview builds and unchanged full-film planning",
  async (provider, mode) => {
    const automatic = mode === "automatic";
    const resuming = mode === "refinement-resume";
    const refining = mode === "refinement" || resuming;
    const kind = mode === "preview" || mode === "selected-preview" ? "preview" : "full";
    const duration = automatic ? 90 : refining ? 125 : kind === "full" ? 124 : 3;
    const targetDuration = kind === "full" ? 120 : 3;
    const { generateVideo } = await import("../src/server/domains/video/workflow");
    const { loadCatalog } = await import("../src/server/catalog/catalog");
    const { VideoRequestSchema } = await import("../src/shared/domains/video");
    const options = await input();
    const controller = new AbortController();
    options.job.kind = kind;
    options.job.duration = targetDuration;
    if (refining) {
      options.job.refinementPrompt = "Extend the credits to 125 seconds";
      options.job.sessionId = "refinement-source-session";
    }
    if (automatic || mode === "direct" || kind === "preview") {
      if (automatic) options.job.duration = 15;
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
    if (resuming) {
      options.job.production = ProductionSchema.parse({ ...production, duration: 120 });
      await writeFile(
        path.join(options.job.workspace, "STORYBOARD.json"),
        JSON.stringify(validStoryboard(120)),
      );
    }
    if (kind === "full" && !refining)
      vi.mocked(agentTurn).mockImplementationOnce(async (call) => {
        const planningFiles = [
          await readFile(path.join(call.workspace, "VIDEO_PLANNING_GUIDANCE.md"), "utf8"),
          await readFile(path.join(call.workspace, "VIDEO_REQUIREMENTS.md"), "utf8"),
        ].join("\n");
        expect(call.prompt).not.toContain("Show an idea");
        expect(call.prompt.length).toBeLessThan(1000);
        for (const heading of [
          "# Video build planning",
          "## Stage and boundaries",
          "## Planning scope",
          "## Required plan content",
          "## Output constraints",
          "## Next-turn build specification",
          "### Original user idea",
          "### Production parameters",
          "### Renderer contract",
        ])
          expect(planningFiles).toContain(heading);
        expect(call.readOnly).toBe(true);
        expect(call.planMode).toBe(provider === "claude");
        expect(call.referenceUrls).toEqual(["https://example.com/app"]);
        expect(call.model).toBe(options.job.model);
        return { value: previewPlan, sessionId: "planning-session" };
      });
    vi.mocked(agentTurn).mockImplementationOnce(async (call) => {
      expect(call.sessionId).toBe(
        kind === "preview"
          ? undefined
          : refining
            ? "refinement-source-session"
            : "planning-session",
      );
      expect(call.readOnly).toBeUndefined();
      expect(call.model).toBe(options.job.model);
      expect(call.prompt).toContain(
        kind === "preview"
          ? "# Build this preview"
          : resuming
            ? "The user answered a question"
            : refining
              ? "REVISION SCOPE"
              : "IMPLEMENT THE SAVED VIDEO BUILD PLAN",
      );
      if (kind === "preview") {
        expect(call.prompt).not.toContain("ORIGINAL USER IDEA");
        expect(call.prompt).not.toContain("NEXT-TURN BUILD SPECIFICATION");
        expect(call.prompt).toContain("displayTitle and displayDescription");
      }
      if (refining) {
        expect(call.prompt).toContain("between 115 and 125");
        expect(call.prompt).not.toContain("duration MUST be 120");
        expect(
          call.schema.safeParse({ ...production, duration: 125, storyboard: validStoryboard(125) })
            .success,
        ).toBe(true);
        expect(
          call.schema.safeParse({ ...production, duration: 126, storyboard: validStoryboard(126) })
            .success,
        ).toBe(false);
      }
      expect(call.schema.parse(production)).toMatchObject({
        storyboard: validStoryboard(duration),
      });
      return {
        value: production,
        sessionId:
          kind === "preview"
            ? "preview-build-session"
            : refining
              ? "refinement-source-session"
              : "planning-session",
      };
    });
    await expect(
      generateVideo({
        job: options.job,
        request: VideoRequestSchema.parse({
          instructions: "Show an idea",
          provider,
          urls: ["https://example.com/app"],
          frameRate: 60,
          duration: automatic ? "auto" : targetDuration,
          ...(automatic || mode === "direct" || mode === "selected-preview"
            ? {
                selectedStyleIds: ["style-018"],
                candidateCount: mode === "selected-preview" ? 2 : 0,
              }
            : {}),
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
        decisions: resuming
          ? "Extend the credits from 120 to 125 seconds as originally requested."
          : undefined,
        render: async () => {
          controller.abort(new Error("verified before render"));
          throw controller.signal.reason;
        },
      }),
    ).rejects.toThrow("verified before render");
    expect(agentTurn).toHaveBeenCalledTimes(kind === "preview" || refining ? 1 : 2);
    expect(options.job.sessionId).toBe(
      kind === "preview"
        ? "preview-build-session"
        : refining
          ? "refinement-source-session"
          : "planning-session",
    );
    expect(options.job.duration).toBe(duration);
    expect(
      await readFile(path.join(options.job.workspace, "EXECUTABLE_PROMPT.md"), "utf8"),
    ).toContain(
      kind === "preview"
        ? "# Build this preview"
        : resuming
          ? "The user answered a question"
          : refining
            ? "REVISION SCOPE"
            : "IMPLEMENT THE SAVED VIDEO BUILD PLAN",
    );
  },
);

it.each(["claude", "codex"] as const)(
  "keeps concurrent %s preview planning histories separate",
  async (provider) => {
    const first = await input();
    const second = await input();
    const previews = [first, second];
    for (const preview of previews) preview.job.sessionId = undefined;
    vi.mocked(agentTurn).mockImplementation(async (call) => {
      expect(call.sessionId).toBeUndefined();
      return { value: validPlan(), sessionId: `session-${call.workspace}` };
    });
    const prompts = await Promise.all(
      previews.map((preview) => prepareVideoBuildPlan({ ...preview, provider })),
    );
    expect(first.job.sessionId).not.toBe(second.job.sessionId);
    for (const [index, preview] of previews.entries()) {
      expect(preview.job.buildPlan?.sessionId).toBe(preview.job.sessionId);
      expect(prompts[index]).not.toContain("Continue in the same model session");
      expect(prompts[index]).not.toContain(preview.prompt);
    }
    expect(agentTurn).toHaveBeenCalledTimes(2);
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
    const planningPrompt = await readFile(
      path.join(options.job.workspace, "VIDEO_PLANNING_GUIDANCE.md"),
      "utf8",
    );
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
  options.job.model = "claude-opus-5-5";
  vi.mocked(agentTurn).mockResolvedValueOnce({ value: validPlan(), sessionId: "preview-plan" });
  expect(needsVideoBuildPlan(options.job)).toBe(true);
  expect(await prepareVideoBuildPlan({ ...options, provider: "claude" })).toContain(
    "IMPLEMENT THE SAVED VIDEO BUILD PLAN",
  );
  expect(agentTurn).toHaveBeenCalledOnce();
});

it("does not restrict preview planning to an allowlist of model names", async () => {
  const options = await input();
  options.job.model = "gpt-6-astra";
  vi.mocked(agentTurn).mockResolvedValueOnce({ value: validPlan(), sessionId: "preview-plan" });
  await prepareVideoBuildPlan(options);
  expect(agentTurn).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-6-astra" }));
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
      expect(
        await readFile(path.join(call.workspace, "VIDEO_PLANNING_GUIDANCE.md"), "utf8"),
      ).toContain("specification's duration is provisional");
      return { value: fullPlan(90), sessionId: "auto-main-plan" };
    });
    await prepareVideoBuildPlan({ ...options, provider, automaticDuration: true });
    expect(options.job.duration).toBe(90);
    expect(options.job.buildPlan?.value).toMatchObject({ durationSeconds: 90 });
    await prepareVideoBuildPlan({ ...options, provider });
    expect(agentTurn).toHaveBeenCalledOnce();
  },
);

it.each(["claude", "codex"] as const)(
  "uses a nearby planned duration for %s instead of locking the requested target",
  async (provider) => {
    const options = await input();
    options.job.kind = "full";
    options.job.duration = 120;
    options.job.sessionId = undefined;
    vi.mocked(agentTurn).mockImplementationOnce(async (call) => {
      for (const duration of [115, 120, 125])
        expect(call.schema.safeParse(fullPlan(duration)).success).toBe(true);
      for (const duration of [114, 126])
        expect(call.schema.safeParse(fullPlan(duration)).success).toBe(false);
      expect(
        await readFile(path.join(call.workspace, "VIDEO_PLANNING_GUIDANCE.md"), "utf8"),
      ).toContain("between 115 and 125");
      return { value: fullPlan(124), sessionId: "target-plan" };
    });
    await prepareVideoBuildPlan({ ...options, provider, targetDuration: 120 });
    expect(options.job.duration).toBe(124);
    expect(
      JSON.parse(await readFile(path.join(options.job.workspace, "STORYBOARD.json"), "utf8")),
    ).toMatchObject({ durationSeconds: 124 });
    await prepareVideoBuildPlan({ ...options, provider, targetDuration: 120 });
    expect(agentTurn).toHaveBeenCalledOnce();
  },
);

it("keeps explicit script windows inside the selected actual duration", () => {
  const schema = fullVideoPlanSchemaFor(
    { ...size, duration: undefined, targetDuration: 120, minimumDuration: 124 },
    true,
  );
  expect(schema.safeParse(fullPlan(123)).success).toBe(false);
  expect(schema.safeParse(fullPlan(124)).success).toBe(true);
  expect(schema.safeParse(fullPlan(125)).success).toBe(true);
  expect(schema.safeParse(fullPlan(126)).success).toBe(false);
  expect(schema.safeParse({ ...fullPlan(124), storyboard: validStoryboard(125) }).success).toBe(
    false,
  );
});

it("requires a complete full-film storyboard before handing off a new build", async () => {
  const options = await input();
  options.job.kind = "full";
  const incomplete = fullPlan();
  const { storyboard: _storyboard, ...withoutStoryboard } = incomplete;
  vi.mocked(agentTurn).mockResolvedValue({ value: withoutStoryboard, sessionId: "main" });
  await expect(prepareVideoBuildPlan(options)).rejects.toBeInstanceOf(StructuredOutputError);
  await expect(readFile(path.join(options.job.workspace, "STORYBOARD.json"))).rejects.toMatchObject(
    { code: "ENOENT" },
  );
  expect(options.onEvent.mock.calls.some(([event]) => event.type === "plan_ready")).toBe(false);
});
it("saves the validated storyboard before announcing readiness and preserves it on retries", async () => {
  const options = await input();
  options.job.kind = "full";
  const plan = fullPlan();
  vi.mocked(agentTurn).mockResolvedValue({ value: plan, sessionId: "main" });
  await prepareVideoBuildPlan(options);
  expect(options.job.storyboardReady).toBe(true);
  expect(
    JSON.parse(await readFile(path.join(options.job.workspace, "STORYBOARD.json"), "utf8")),
  ).toEqual(plan.storyboard);
  await prepareVideoBuildPlan(options);
  expect(agentTurn).toHaveBeenCalledOnce();
  expect(options.onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "plan_ready",
      message: "Plan ready",
    }),
  );
});
it("rejects a storyboard whose duration differs from the full-film plan", () => {
  expect(
    fullVideoPlanSchemaFor(size, true).safeParse({ ...fullPlan(), storyboard: validStoryboard(4) })
      .success,
  ).toBe(false);
});
it("upgrades historical full-film plans before new capture work", async () => {
  const options = await input();
  options.job.kind = "full";
  const { storyboard: _storyboard, ...oldPlan } = fullPlan();
  options.job.buildPlan = {
    model: options.job.model,
    sessionId: options.job.sessionId!,
    value: oldPlan,
  };
  vi.mocked(agentTurn).mockResolvedValue({ value: fullPlan(), sessionId: options.job.sessionId });
  await prepareVideoBuildPlan(options);
  expect(agentTurn).toHaveBeenCalledOnce();
  expect(
    JSON.parse(await readFile(path.join(options.job.workspace, "STORYBOARD.json"), "utf8")),
  ).toEqual(fullPlan().storyboard);
});

it("links every capture chapter to the storyboard before recording", () => {
  const plan = {
    ...fullPlan(),
    storyboard: StoryboardSchema.parse(fullPlan().storyboard),
    capturePlan: {
      scope: "Show playback",
      story: "Watch an example",
      chapters: [
        {
          id: "watch",
          title: "Watch",
          purpose: "See the result",
          startingState: "Result page",
          actions: ["Play"],
          expectedResults: ["Playback"],
          nextChapterContext: "End",
          estimatedDurationSeconds: 3,
        },
      ],
    },
  };
  const schema = fullVideoPlanSchemaFor(size, true);
  expect(schema.safeParse(plan).success).toBe(false);
  plan.storyboard.scenes[0].assets = ["capture:watch"];
  expect(schema.safeParse(plan).success).toBe(true);
  plan.storyboard.scenes[0].assets = ["capture:missing"];
  expect(schema.safeParse(plan).success).toBe(false);
});

it("preserves the reconciled production storyboard when resuming narration for an assembled film", async () => {
  const options = await input();
  options.job.kind = "full";
  const plan = fullPlan();
  options.job.buildPlan = {
    model: options.job.model,
    sessionId: options.job.sessionId!,
    value: plan,
  };
  options.job.production = {
    pipeline: "HyperFrames",
    fallbackReason: null,
    styleRenderer: ["HTML/CSS"],
    motionEngine: ["GSAP"],
    sourceFile: "index.html",
    duration: 3,
    width: 1920,
    height: 1080,
    fps: 60,
    displayTitle: "A result",
    displayDescription: "A result appears",
    audioDescription: "Silent",
    limitations: [],
  };
  const reconciled = { ...validStoryboard(3), title: "Reconciled with actual footage and speech" };
  await writeFile(path.join(options.job.workspace, "STORYBOARD.json"), JSON.stringify(reconciled));
  await prepareVideoBuildPlan(options);
  expect(agentTurn).not.toHaveBeenCalled();
  expect(
    JSON.parse(await readFile(path.join(options.job.workspace, "STORYBOARD.json"), "utf8")),
  ).toEqual(reconciled);
});

it("revises a saved capture budget in the same main session and saves the new storyboard before retry", async () => {
  const options = await input();
  options.job.kind = "full";
  const approved = {
    ...fullPlan(),
    storyboard: StoryboardSchema.parse(validStoryboard()),
    capturePlan: {
      scope: "Create",
      story: "Show creation",
      chapters: [
        {
          id: "create",
          title: "Create",
          purpose: "Create",
          startingState: "Home",
          actions: ["Type"],
          expectedResults: ["Result"],
          nextChapterContext: "End",
          estimatedDurationSeconds: 1,
        },
      ],
    },
  };
  approved.storyboard.scenes[0].assets = ["capture:create"];
  options.job.buildPlan = {
    model: options.job.model,
    sessionId: options.job.sessionId!,
    value: approved,
  };
  const revised = structuredClone(approved);
  revised.capturePlan.chapters[0].estimatedDurationSeconds = 2;
  vi.mocked(agentTurn).mockImplementationOnce(async (call) => {
    expect(call.sessionId).toBe(options.job.sessionId);
    expect(call.readOnly).toBe(true);
    expect(call.model).toBe(options.job.model);
    expect(call.prompt).toContain("REVISE CAPTURE TIMING");
    const missingCoverage = structuredClone(revised);
    missingCoverage.capturePlan.chapters[0].actions = ["Skip typing"];
    expect(call.schema.safeParse(missingCoverage).success).toBe(false);
    const oversized = structuredClone(revised);
    oversized.capturePlan.chapters[0].estimatedDurationSeconds = 4;
    expect(call.schema.safeParse(oversized).success).toBe(false);
    return { value: revised, sessionId: options.job.sessionId };
  });
  await prepareVideoBuildPlan({
    ...options,
    captureTimingConflict: {
      chapterId: "create",
      targetDurationSeconds: 1,
      requiredDurationSeconds: 2,
      reason: "Need readable typing",
    },
  });
  expect(options.job.buildPlan.value).toEqual(revised);
  expect(
    JSON.parse(await readFile(path.join(options.job.workspace, "STORYBOARD.json"), "utf8")),
  ).toEqual(revised.storyboard);
  expect(options.onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "plan_ready" }));
});

it.each([false, true])(
  "publishes accepted plan artifacts once, with capture=%s",
  async (capture) => {
    const options = await input();
    options.job.kind = "full";
    const capturePlan = capture
      ? {
          scope: "Show a result",
          story: "Open then play",
          chapters: [
            {
              id: "watch",
              title: "Watch",
              purpose: "See the result",
              startingState: "Result page",
              actions: ["Play"],
              expectedResults: ["Playback"],
              nextChapterContext: "End",
              estimatedDurationSeconds: 3,
            },
          ],
        }
      : null;
    const plan = {
      ...fullPlan(),
      storyboard: StoryboardSchema.parse(fullPlan().storyboard),
      capturePlan,
    };
    if (capture) plan.storyboard.scenes[0].assets = ["capture:watch"];
    vi.mocked(agentTurn).mockResolvedValue({ value: plan, sessionId: "main" });
    await prepareVideoBuildPlan(options);
    const ready = () =>
      options.onEvent.mock.calls
        .map(([event]) => event)
        .filter((event) => event.type.endsWith("_ready"));
    expect(ready().map((event) => event.message)).toEqual(
      capture
        ? ["Plan ready", "Storyboard ready", "Capture plan ready"]
        : ["Plan ready", "Storyboard ready"],
    );
    expect(
      JSON.parse(await readFile(path.join(options.job.workspace, "VIDEO_BUILD_PLAN.json"), "utf8")),
    ).toEqual(plan);
    expect(
      JSON.parse(await readFile(path.join(options.job.workspace, "STORYBOARD.json"), "utf8")),
    ).toEqual(plan.storyboard);
    await prepareVideoBuildPlan(options);
    expect(ready()).toHaveLength(capture ? 3 : 2);
  },
);
