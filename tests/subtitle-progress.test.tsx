import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { buildLanguageMedia } from "../src/server/domains/video/language-media";
import type { LanguageMediaInput } from "../src/server/domains/video/language-media/types";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { SubtitleProgressSchema, type SubtitleProgress } from "../src/shared/subtitle-progress";
import type { ProviderEvent } from "../src/server/agents/agent";
import { activityItems } from "../src/client/agent-activity-model";
import { activityLabel, displayActivityItems } from "../src/client/activity-display";
import { ActivityWorkTitle } from "../src/client/components/activity-progress";
import { validStoryboard } from "./fixtures/storyboard";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "subtitle-progress-"));
  folders.push(workspace);
  await writeFile(path.join(workspace, "STORYBOARD.json"), JSON.stringify(validStoryboard(3)));
  const progress: SubtitleProgress[] = [];
  const events: ProviderEvent[] = [];
  const input: LanguageMediaInput = {
    job: {
      id: "job",
      runId: "project",
      candidateId: "direction",
      kind: "full",
      phase: "rendering",
      model: "example",
      workspace,
      duration: 3,
      speechTrack: {
        file: "voice.wav",
        durationSeconds: 3,
        source: "narration",
        cues: [0, 1, 2].map((index) => ({
          text: `Cue ${index}`,
          startSeconds: index,
          endSeconds: index + 1,
        })),
      },
    },
    request: VideoRequestSchema.parse({
      instructions: "Explain an example",
      languageTracks: { narration: [], subtitles: ["en", "zh"], defaultSubtitle: "en" },
    }),
    brief: {
      subject: "Example",
      audience: "Learners",
      objective: "Explain",
      facts: [],
      exactCopy: [],
      previewBeat: "An example",
      assetDescriptions: [],
      constraints: [],
      suggestedDuration: 3,
      durationReason: "Short",
    },
    signal: AbortSignal.timeout(10000),
    emit: vi.fn(),
    onEvent: (event) => {
      events.push(event);
      const value = SubtitleProgressSchema.parse(
        (event.data as { subtitleProgress: unknown }).subtitleProgress,
      );
      if (value.status === "complete") {
        expect(existsSync(path.join(workspace, `audio/languages/${value.language}.vtt`))).toBe(
          true,
        );
        expect(existsSync(path.join(workspace, `audio/languages/${value.language}.srt`))).toBe(
          true,
        );
      }
      progress.push(value);
    },
  };
  return { input, progress, events };
}
it("reports real completed cues for each language and completes after both subtitle files exist", async () => {
  const { input, progress } = await fixture();
  const translate = vi.fn(async (text, language) => {
    const last = progress.at(-1)!;
    expect(last.language).toBe(language);
    expect(last.completed).toBe(Number(text.split(" ")[1]));
    return text;
  });
  await buildLanguageMedia(input, { translate });
  for (const language of ["en", "zh"])
    expect(
      progress
        .filter((item) => item.language === language)
        .map((item) => [item.completed, item.total, item.status]),
    ).toEqual([
      [0, 3, "running"],
      [1, 3, "running"],
      [2, 3, "running"],
      [3, 3, "complete"],
    ]);
  expect(translate).toHaveBeenCalledTimes(6);
});
it.each([false, true])(
  "retains completed cue count when translation fails or stops (abort=%s)",
  async (abort) => {
    const { input, progress } = await fixture();
    const controller = new AbortController();
    input.signal = controller.signal;
    let calls = 0;
    await expect(
      buildLanguageMedia(input, {
        translate: async (text) => {
          if (++calls === 2) {
            if (abort) controller.abort();
            throw Error("Stopped translation");
          }
          return text;
        },
      }),
    ).rejects.toThrow("Stopped translation");
    expect(progress.at(-1)).toMatchObject({
      language: "en",
      completed: 1,
      total: 3,
      status: abort ? "stopped" : "failed",
    });
    expect(progress.some((item) => item.status === "complete")).toBe(false);
  },
);
it("updates one activity row per language and displays cues and measured percentage", () => {
  const make = (completed: number, language = "en", status = "running") => ({
    type: "subtitle_progress",
    message: "Subtitle progress",
    data: { subtitleProgress: { language, completed, total: 30, status } },
  });
  const events = [make(0), make(18), make(2, "zh")].map((event, index) => ({
    ...event,
    id: index + 1,
    runId: "project",
    jobId: "job",
    time: "2026-01-01T00:00:00Z",
  }));
  const items = displayActivityItems(activityItems(events));
  expect(items).toHaveLength(2);
  expect(activityLabel(items[0])).toBe("Generating English subtitles… 18/30 cues · 60%");
  const html = renderToStaticMarkup(<ActivityWorkTitle item={items[0]} />);
  expect(html).toContain("18/30 cues");
  expect(html).toContain("60%");
  const failed = activityItems([
    ...events,
    {
      ...events[0],
      id: 4,
      data: { subtitleProgress: { language: "en", completed: 18, total: 30, status: "failed" } },
    },
  ]);
  expect(failed.find((item) => item.subtitleProgress?.language === "en")?.status).toBe("failed");
  expect(
    SubtitleProgressSchema.safeParse({
      language: "en",
      completed: 31,
      total: 30,
      status: "running",
    }).success,
  ).toBe(false);
});
