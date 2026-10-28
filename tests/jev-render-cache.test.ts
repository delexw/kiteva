import { expect, it, vi } from "vitest";
vi.mock("../src/server/jev/choice", () => ({ runJevChoice: vi.fn() }));
vi.mock("../src/server/jev/strategies/render-cache/brief", () => ({
  buildRenderCacheBrief: vi.fn(),
}));
import { buildRenderCacheBrief } from "../src/server/jev/strategies/render-cache/brief";
import { runJevChoice } from "../src/server/jev/choice";
import { reviewRenderCache } from "../src/server/jev/strategies/render-cache";
it("uses native Choice for reuse/refresh, forwards governance events and fails closed", async () => {
  const onEvent = vi.fn(),
    signal = new AbortController().signal;
  vi.mocked(buildRenderCacheBrief).mockResolvedValue({
    summary: "Only unrelated metadata changed",
    changedFiles: ["last.html"],
    renderImpact: "No shot effect",
    limitations: [],
    uncertain: false,
  });
  vi.mocked(runJevChoice).mockImplementation(async (options) => {
    options.onEvent({ type: "usage", message: "Recorded cache review", data: { provider: "jev" } });
    return {
      answer: {
        choice: "reuse",
        type: "choice",
        confidence: 0.9,
        probabilities: { reuse: 0.9, refresh: 0.1 },
      },
      model: "fixture",
      comparedIds: ["reuse", "refresh"],
    };
  });
  expect(
    await reviewRenderCache({
      workspace: "/unused",
      state: { shot: "first.html", changes: ["last.html"] },
      signal,
      onEvent,
    }),
  ).toBe(true);
  expect(onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "usage",
      data: { provider: "jev", purpose: "Render cache review" },
    }),
  );
  expect(vi.mocked(runJevChoice).mock.calls[0][0]).toMatchObject({
    label: "Render cache review",
    questionKey: "cache",
    signal,
  });
  vi.mocked(runJevChoice).mockRejectedValueOnce(Error("Unavailable"));
  expect(await reviewRenderCache({ workspace: "/unused", state: {}, signal, onEvent })).toBe(false);
  await expect(
    reviewRenderCache({
      workspace: "/unused",
      state: {},
      signal: AbortSignal.abort(Error("Stopped")),
      onEvent,
    }),
  ).rejects.toThrow("Stopped");
});
it("sends only the Haiku brief to JEV and refuses uncertain or failed summarization", async () => {
  const input = {
    workspace: "/unused",
    state: { shot: "shot.html", sourceContext: [{ file: "shot.html", text: "x".repeat(4000) }] },
    signal: new AbortController().signal,
    onEvent: vi.fn(),
  };
  vi.mocked(buildRenderCacheBrief).mockResolvedValue({
    summary: "A visual change cannot be excluded",
    changedFiles: ["shared.js"],
    renderImpact: "Unknown",
    limitations: ["Incomplete source"],
    uncertain: true,
  });
  vi.mocked(runJevChoice).mockResolvedValue({
    answer: {
      choice: "reuse",
      type: "choice",
      confidence: 0.9,
      probabilities: { reuse: 0.9, refresh: 0.1 },
    },
    model: "fixture",
    comparedIds: ["reuse", "refresh"],
  });
  expect(await reviewRenderCache(input)).toBe(false);
  const state = vi.mocked(runJevChoice).mock.calls.at(-1)![0].state;
  expect(state).toMatchObject({ shot: "shot.html", changeBrief: { uncertain: true } });
  expect(state).toMatchObject({ sourceContext: input.state.sourceContext });
  expect(Buffer.byteLength(JSON.stringify(state))).toBeLessThan(28000);
  const calls = vi.mocked(runJevChoice).mock.calls.length;
  vi.mocked(buildRenderCacheBrief).mockRejectedValueOnce(Error("Summary unavailable"));
  expect(await reviewRenderCache(input)).toBe(false);
  expect(runJevChoice).toHaveBeenCalledTimes(calls);
});

it("skips both providers when per-shot evidence is too large", async () => {
  vi.mocked(buildRenderCacheBrief).mockClear();
  vi.mocked(runJevChoice).mockClear();
  expect(
    await reviewRenderCache({
      workspace: "/unused",
      signal: new AbortController().signal,
      onEvent: vi.fn(),
      state: { shot: "shot.html", sourceContext: "x".repeat(28000) },
    }),
  ).toBe(false);
  expect(buildRenderCacheBrief).not.toHaveBeenCalled();
  expect(runJevChoice).not.toHaveBeenCalled();
});

it("keeps hidden source dependencies out of both providers", async () => {
  vi.mocked(buildRenderCacheBrief).mockClear();
  vi.mocked(runJevChoice).mockClear();
  expect(
    await reviewRenderCache({
      workspace: "/unused",
      signal: new AbortController().signal,
      onEvent: vi.fn(),
      state: {
        shot: "shot.html",
        changes: [{ file: "shared.js" }],
        sourceContext: [{ file: "assets/.private/data.json", text: "private" }],
      },
    }),
  ).toBe(false);
  expect(buildRenderCacheBrief).not.toHaveBeenCalled();
  expect(runJevChoice).not.toHaveBeenCalled();
});
