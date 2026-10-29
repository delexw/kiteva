import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/server/jev/choice", () => ({ runJevChoice: vi.fn() }));
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import { runJevChoice } from "../src/server/jev/choice";
import { reviewRenderCache } from "../src/server/jev/strategies/render-cache";

const input = () => ({
  workspace: "/unused",
  state: {
    shot: "first.html",
    unchangedRenderSettings: { fps: 60 },
    staticGraphComplete: false,
    changes: [
      {
        file: "last.html",
        before: { hash: "old", text: "old credits", complete: true },
        after: { hash: "new", text: "new credits", complete: true },
      },
    ],
    sourceContext: [{ file: "first.html", hash: "same", text: "<p>Opening</p>", complete: true }],
  },
  signal: new AbortController().signal,
  onEvent: vi.fn(),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runJevChoice).mockImplementation(async (options) => {
    options.onEvent({ type: "usage", message: "Recorded", data: { provider: "jev" } });
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
});
it("reviews factual evidence directly without Haiku or a global uncertainty veto", async () => {
  const options = input();
  expect(await reviewRenderCache(options)).toBe(true);
  expect(agentTurn).not.toHaveBeenCalled();
  expect(runJevChoice).toHaveBeenCalledOnce();
  expect(vi.mocked(runJevChoice).mock.calls[0][0].state).toMatchObject({
    shot: "first.html",
    staticGraphComplete: false,
    changes: [{ file: "last.html", beforeHash: "old", afterHash: "new" }],
  });
  expect(options.onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "usage",
      data: { provider: "jev", purpose: "Render cache review" },
    }),
  );
  expect(options.onEvent).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ cacheDecision: "reuse" }) }),
  );
});
it("honors refresh, reports failures and propagates cancellation", async () => {
  const options = input();
  vi.mocked(runJevChoice).mockResolvedValueOnce({
    answer: {
      choice: "refresh",
      type: "choice",
      confidence: 0.8,
      probabilities: { reuse: 0.2, refresh: 0.8 },
    },
    model: "fixture",
    comparedIds: ["reuse", "refresh"],
  });
  expect(await reviewRenderCache(options)).toBe(false);
  vi.mocked(runJevChoice).mockRejectedValueOnce(Error("Unavailable"));
  expect(await reviewRenderCache(options)).toBe(false);
  expect(options.onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "warning",
      data: expect.objectContaining({ reason: "Unavailable", cacheDecision: "refresh" }),
    }),
  );
  await expect(
    reviewRenderCache({ ...options, signal: AbortSignal.abort(Error("Stopped")) }),
  ).rejects.toThrow("Stopped");
});
it("explains oversized evidence and keeps hidden inputs local before any provider call", async () => {
  const options = input();
  options.state.sourceContext[0].text = "x".repeat(30000);
  expect(await reviewRenderCache(options)).toBe(false);
  expect(options.onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ reason: expect.stringContaining("review budget") }),
    }),
  );
  options.state.sourceContext[0].file = "assets/.private/data.json";
  expect(await reviewRenderCache(options)).toBe(false);
  expect(runJevChoice).not.toHaveBeenCalled();
  expect(agentTurn).not.toHaveBeenCalled();
});
