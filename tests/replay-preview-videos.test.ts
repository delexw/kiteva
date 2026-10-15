import { expect, it, vi } from "vitest";
import type { GenerationJob } from "../src/shared/contracts";
import { replayPreviewVideos } from "../src/client/lib/replay-preview-videos";
const job = (id: string, kind: "preview" | "full"): GenerationJob => ({
  id,
  kind,
  runId: "project",
  candidateId: "same-direction",
  workspace: "/tmp/unused",
  model: "test",
  phase: "ready",
  duration: kind === "preview" ? 3 : 120,
});
it("restarts only preview-choice videos, leaving full video positions and playback untouched", () => {
  const preview = { currentTime: 2, play: vi.fn().mockResolvedValue(undefined) };
  const full = { currentTime: 45, play: vi.fn().mockResolvedValue(undefined) };
  const jobs = [
    job("preview", "preview"),
    job("full", "full"),
    job("unmounted-preview", "preview"),
  ];
  replayPreviewVideos(
    jobs,
    new Map([
      ["preview", preview],
      ["full", full],
    ]),
  );
  expect(preview.currentTime).toBe(0);
  expect(preview.play).toHaveBeenCalledOnce();
  expect(full.currentTime).toBe(45);
  expect(full.play).not.toHaveBeenCalled();
});
it("skips page previews and tolerates rejected playback", async () => {
  const rejected = { currentTime: 2, play: vi.fn().mockRejectedValue(Error("Playback denied")) };
  const page = { currentTime: 8, play: vi.fn().mockResolvedValue(undefined) };
  replayPreviewVideos(
    [
      job("preview", "preview"),
      {
        id: "page",
        runId: "project",
        candidateId: "same-direction",
        kind: "preview",
        outputType: "page",
        workspace: "/tmp/unused",
        model: "test",
        phase: "ready",
      },
    ],
    new Map([
      ["preview", rejected],
      ["page", page],
    ]),
  );
  await Promise.resolve();
  expect(rejected.currentTime).toBe(0);
  expect(page.currentTime).toBe(8);
  expect(page.play).not.toHaveBeenCalled();
});
