import { validStoryboard } from "./fixtures/storyboard";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { prepareScriptItems } from "../src/server/domains/video/prepare-script-items";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { BriefSchema } from "../src/shared/agents/schemas/video";
import { prepareVideoBuildPlan } from "../src/server/domains/video/build-plan";
import type { VideoGenerationJob } from "../src/shared/domains/video";
import { scriptItemsDirection } from "../src/shared/script-items";

it("generates only requested items from the approved plan, preserves Eve and exact copy, and caches by plan", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "generated-script-test-"));
  try {
    const speech = {
      mode: "narration",
      engine: "pocket-tts",
      voice: "pocket_eve",
      language: "en",
      speed: 1,
    };
    const fixed = {
      id: "intro",
      startSeconds: 0,
      endSeconds: 10,
      text: "Meet the application.",
      showSubtitles: true,
      speech,
    };
    const request = VideoRequestSchema.parse({
      instructions: "An application demo",
      provider: "claude",
      mainModel: "claude-opus-5-5",
      duration: 60,
      scriptItems: [
        fixed,
        {
          ...fixed,
          id: "demo",
          source: "write",
          text: "Explain the planned player demonstration, not a UI tour.",
          startSeconds: 10,
          endSeconds: 50,
        },
      ],
    });
    const brief = BriefSchema.parse({
      subject: "Application",
      audience: "Teams",
      objective: "Explain",
      facts: [],
      exactCopy: [],
      previewBeat: "Player",
      assetDescriptions: [],
      constraints: [],
      suggestedDuration: 60,
      durationReason: "Demo",
    });
    const plan = {
      version: 2 as const,
      storyboard: validStoryboard(60),
      width: 1280,
      height: 720,
      fps: 30,
      durationSeconds: 60,
      plan: "10–50s: watch the output, then seek to a chapter. Prototype only.",
    };
    const generate = vi.fn().mockResolvedValue({
      sessionId: "main-session",
      value: { text: "Watch the explanation. Jump straight to the chapter you need." },
    });
    const job: VideoGenerationJob = {
      id: "full",
      runId: "project",
      candidateId: "candidate",
      kind: "full",
      model: "claude-opus-5-5",
      duration: 60,
      phase: "generating",
      workspace,
      sessionId: "main-session",
      buildPlan: { model: "claude-opus-5-5", sessionId: "main-session", value: plan },
    };
    const onEvent = vi.fn((event) => {
      if (event.type === "session") job.sessionId = event.data.sessionId;
    });
    generate.mockImplementationOnce(async (options) => {
      options.onEvent({
        type: "session",
        message: "Session resumed",
        data: { sessionId: "main-session" },
      });
      return {
        sessionId: "main-session",
        value: { text: "Watch the explanation. Jump straight to the chapter you need." },
      };
    });
    const input = {
      request,
      sessionId: "main-session",
      brief,
      plan,
      workspace,
      signal: new AbortController().signal,
      onEvent,
    };
    const result = await prepareScriptItems(input, generate);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0].model).toBe("claude-opus-5-5");
    expect(generate.mock.calls[0][0].sessionId).toBe("main-session");
    expect(job.sessionId).toBe(job.buildPlan!.sessionId);
    await expect(
      prepareVideoBuildPlan({
        job,
        provider: "claude",
        prompt: "Build",
        width: 1280,
        height: 720,
        fps: 30,
        signal: input.signal,
        onEvent,
        update: vi.fn(),
      }),
    ).resolves.toContain("IMPLEMENT THE SAVED VIDEO BUILD PLAN");
    expect(generate.mock.calls[0][0].prompt).toContain(plan.plan);
    expect(generate.mock.calls[0][0].prompt).toContain('"language":"en"');
    expect(generate.mock.calls[0][0].readOnly).toBe(true);
    expect(result.scriptItems![0]).toEqual(request.scriptItems![0]);
    expect(result.scriptItems![1]).toMatchObject({
      source: "provided",
      text: "Watch the explanation. Jump straight to the chapter you need.",
      speech: { voice: "pocket_eve" },
      startSeconds: 10,
      endSeconds: 50,
    });
    expect(request.scriptItems![1].source).toBe("write");
    expect(scriptItemsDirection(result.scriptItems)).not.toContain(
      "Explain the planned player demonstration",
    );
    expect(await prepareScriptItems(input, generate)).toEqual(result);
    expect(generate).toHaveBeenCalledOnce();
    await prepareScriptItems(
      { ...input, plan: { ...plan, plan: "Watch output, then save it." } },
      generate,
    );
    expect(generate).toHaveBeenCalledTimes(2);
    const disconnected = vi
      .fn()
      .mockResolvedValue({ sessionId: "other-session", value: { text: "Unexpected text" } });
    await expect(
      prepareScriptItems(
        { ...input, sessionId: "", plan: { ...plan, plan: "Missing session" } },
        disconnected,
      ),
    ).rejects.toThrow("requires the main planning session");
    expect(disconnected).not.toHaveBeenCalled();
    await expect(
      prepareScriptItems(
        { ...input, plan: { ...plan, plan: "Disconnected result" } },
        disconnected,
      ),
    ).rejects.toThrow("did not return the main planning session");
    const incorrectEvent = vi.fn().mockImplementation(async (options) => {
      options.onEvent({
        type: "session",
        message: "Wrong session",
        data: { sessionId: "other-session" },
      });
      return { sessionId: "other-session", value: { text: "Unexpected text" } };
    });
    await expect(
      prepareScriptItems(
        { ...input, plan: { ...plan, plan: "Disconnected event" } },
        incorrectEvent,
      ),
    ).rejects.toThrow("must continue in the main planning session");
    expect(job.sessionId).toBe("main-session");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it("does not generate fixed items", async () => {
  const generate = vi.fn();
  const request = VideoRequestSchema.parse({ instructions: "A short demo", scriptItems: [] });
  const result = await prepareScriptItems(
    {
      request,
      sessionId: "unused",
      brief: {} as never,
      plan: {} as never,
      workspace: "/unused",
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    },
    generate,
  );
  expect(result).toBe(request);
  expect(generate).not.toHaveBeenCalled();
});

it("passes captured evidence to narration in the main session and invalidates cached text when results change", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "captured-script-test-"));
  try {
    const chapter = {
      id: "playback",
      title: "Playback",
      purpose: "Show playback",
      startingState: "Open the result",
      actions: ["Play the result"],
      expectedResults: ["Playback visible"],
      nextChapterContext: "End",
      estimatedDurationSeconds: 20,
    };
    const plan = {
      version: 2 as const,
      width: 1280,
      height: 720,
      fps: 30,
      durationSeconds: 60,
      plan: "Show playback",
      capturePlan: {
        scope: "Show the result",
        story: "Review the explanation",
        chapters: [chapter],
      },
    };
    const request = VideoRequestSchema.parse({
      instructions: "Explain the actual recorded result",
      provider: "claude",
      mainModel: "example-model",
      duration: 60,
      scriptItems: [
        {
          id: "demo",
          source: "write",
          text: "Describe the verified recording",
          startSeconds: 0,
          endSeconds: 30,
          showSubtitles: true,
          speech: {
            mode: "narration",
            engine: "pocket-tts",
            voice: "pocket_eve",
            language: "en",
            speed: 1,
          },
        },
      ],
    });
    const brief = BriefSchema.parse({
      subject: "Application",
      audience: "Teams",
      objective: "Explain",
      facts: [],
      exactCopy: [],
      previewBeat: "Playback",
      assetDescriptions: [],
      constraints: [],
      suggestedDuration: 60,
      durationReason: "Workflow",
    });
    const capture = {
      chapter,
      sessionId: "capture-session",
      fingerprint: "a".repeat(64),
      sha256: "b".repeat(64),
      result: {
        assetPath: "assets/website-video-11111111-1111-4111-8111-111111111111.webm",
        observedResults: ["Playback succeeded"],
        omissions: [] as string[],
        reviewNotes: "Reviewed frames",
      },
      evidence: {
        chapterId: "playback",
        recording: {
          assetPath: "assets/website-video-11111111-1111-4111-8111-111111111111.webm",
          cursorPath: "assets/website-video-11111111-1111-4111-8111-111111111111.cursor.json",
          url: "https://example.com",
          duration: 20,
          width: 1280,
          height: 720,
          fps: 60,
          silent: true,
        },
        documentReviewed: true,
        frameReviews: 1,
      },
    };
    const save = () =>
      writeFile(
        path.join(workspace, "CAPTURED_CHAPTERS.json"),
        JSON.stringify({
          version: 1,
          scope: plan.capturePlan.scope,
          story: plan.capturePlan.story,
          chapters: [capture],
        }),
      );
    await save();
    const generate = vi.fn().mockImplementation(async (options) => ({
      sessionId: "main-session",
      value: {
        text: options.prompt.includes("Playback is unavailable")
          ? "Playback is unavailable in this prototype."
          : "Watch the completed explanation.",
      },
    }));
    const input = {
      request,
      brief,
      plan,
      workspace,
      sessionId: "main-session",
      signal: new AbortController().signal,
      onEvent: () => {},
    };
    await prepareScriptItems(input, generate);
    expect(generate.mock.calls[0][0].sessionId).toBe("main-session");
    expect(generate.mock.calls[0][0].prompt).toContain("Playback succeeded");
    expect(generate.mock.calls[0][0].prompt).toContain('"duration":20');
    capture.result.observedResults = ["Result page opened"];
    capture.result.omissions = ["Playback is unavailable"];
    await save();
    const changed = await prepareScriptItems(input, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(changed.scriptItems![0].text).toBe("Playback is unavailable in this prototype.");
    await prepareScriptItems(input, generate);
    expect(generate).toHaveBeenCalledTimes(2);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
