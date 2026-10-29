import { prepareProjectLayout, workspacePaths } from "../src/server/runtime/workspace";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
const workspaces: string[] = [];
afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })),
  );
});
import { validStoryboard } from "./fixtures/storyboard";
import { expect, it } from "vitest";
import { buildApplicationDemoRoutePrompt } from "../src/server/domains/video/route-prompts/application-demo";
import { buildChapterCapturePrompt } from "../src/server/jobs/subworkflows/chapter-capture/prompt";
import {
  chapterCardsGuidance,
  footagePlacementGuidance,
} from "../src/server/domains/video/route-prompts/application-demo/shared";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { CaptureChapterPlanSchema } from "../src/shared/capture-chapters";

it.each(["hyperframes", "multiplane"] as const)(
  "scopes %s guidance to planning and assembly",
  (renderer) => {
    const planning = buildApplicationDemoRoutePrompt(renderer, "planning");
    expect(planning).toContain("```mermaid\nflowchart TD");
    expect(planning).toContain("capturePlan=null");
    expect(planning).toContain("SCOPE AND STORY");
    expect(planning).toContain(chapterCardsGuidance);
    expect(planning).toContain("structured capturePlan");
    expect(planning).toContain("starting state, capture actions, visible result");
    expect(planning).toContain("UNSUPPORTED INTERACTIONS");
    expect(planning).not.toMatch(
      /getFrames|getCurrentDocument|FILE PICKERS:|FOOTAGE PLACEMENT:|RECORDED VIDEO|RECORDED FRAME SEQUENCE/,
    );
    const assembly = buildApplicationDemoRoutePrompt(renderer, "assembly");
    expect(assembly).toContain("```mermaid\nflowchart TD");
    expect(assembly).toContain("Integration unavailable");
    expect(assembly).toContain("CAPTURED_CHAPTERS.json");
    expect(assembly).toContain("actual durations");
    expect(assembly).toContain("capture tools are unavailable");
    expect(assembly).toContain(footagePlacementGuidance);
    expect(assembly.split(footagePlacementGuidance)).toHaveLength(2);
    expect(assembly).toContain(chapterCardsGuidance);
    expect(assembly.split(chapterCardsGuidance)).toHaveLength(2);
    expect(assembly).toContain(
      renderer === "multiplane" ? "RECORDED FRAME SEQUENCE" : "RECORDED VIDEO",
    );
    expect(assembly).not.toContain(
      renderer === "multiplane" ? "ROUTE A / HYPERFRAMES" : "ROUTE A / MULTIPLANE",
    );
    expect(assembly).not.toMatch(
      /getFrames|getCurrentDocument|DISCOVER:|FILE PICKERS:|action: "start"/,
    );
    const legacy = buildApplicationDemoRoutePrompt(renderer);
    expect(legacy).toContain(planning);
    expect(legacy).toContain(footagePlacementGuidance);
    expect(legacy.split(footagePlacementGuidance)).toHaveLength(2);
    expect(legacy).toContain("## 6. Export the reviewed take");
    expect(planning.length).toBeLessThan(legacy.length / 2);
    expect(assembly.length).toBeLessThan(legacy.length / 2);
  },
);

it.each([false, true])(
  "gives chapter context using its actual media directory (new layout=%s)",
  async (newLayout) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "capture-prompt-"));
    workspaces.push(workspace);
    if (newLayout) await prepareProjectLayout(workspace);
    const plan = CaptureChapterPlanSchema.parse({
      scope: "Show creation and review",
      story: "One connected example",
      chapters: [
        {
          id: "review",
          title: "Review",
          purpose: "Review the example",
          startingState: "Open the result",
          actions: ["Play the result"],
          expectedResults: ["Visible playback"],
          nextChapterContext: "End",
          estimatedDurationSeconds: 10,
        },
      ],
    });
    const storyboard = validStoryboard(30);
    const prompt = buildChapterCapturePrompt({
      workspace,
      storyboard,
      plan,
      chapter: plan.chapters[0],
      index: 0,
      previousResult: { observedResults: ["Example created"] },
      previousChapterContext: "Continue with the created example",
      request: VideoRequestSchema.parse({
        instructions: "Keep the same sample knowledge item throughout the film",
        urls: ["https://example.com"],
        outputLanguage: "en",
        requirements: {
          main: { instructions: "Preserve the product name" },
          images: { instructions: "Use the supplied cover image" },
          music: { instructions: "Do not include soundtrack instructions in capture" },
          urls: { instructions: "Show playback and publishing; report unsupported sharing" },
        },
      }),
    });
    expect(prompt).toContain(`Use local ${workspacePaths(workspace).assets}/`);
    expect(prompt).toContain(JSON.stringify(storyboard));
    expect(prompt).toContain('"observedResults":["Example created"]');
    expect(prompt).toContain("Review the example");
    expect(prompt).toContain("new model session");
    expect(prompt).toContain("Keep the same sample knowledge item");
    expect(prompt).toContain("Show playback and publishing");
    expect(prompt).toContain("Use the supplied cover image");
    expect(prompt).toContain("Continue with the created example");
    expect(prompt).toContain("https://example.com");
    expect(prompt).toContain("brief-attachments.json");
    expect(prompt).not.toContain("Do not include soundtrack instructions in capture");
    expect(prompt).toContain("do not assume prior browser state persists");
    expect(prompt).toContain("UNSUPPORTED INTERACTIONS");
    expect(prompt).toContain('input[type="file"]');
    expect(prompt).toContain("```mermaid\nflowchart TD");
    expect(prompt).toContain("correct --> document");
    expect(prompt).toContain("check -->|No| document");
    expect(prompt).toContain("After any edit, inspect the affected frames again");
    expect(prompt).toContain("captured footage is excluded from the energetic pacing default");
    expect(prompt.split("## 4. Inspect frames before export")).toHaveLength(2);
    expect(prompt).not.toMatch(
      /DISCOVER:|CHAPTERS:|FOOTAGE PLACEMENT:|ROUTE A \/ MULTIPLANE|ROUTE A \/ HYPERFRAMES/,
    );
    expect(prompt).toContain("Code owns the next chapter");
  },
);
