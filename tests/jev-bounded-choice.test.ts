import { afterEach, expect, it, vi } from "vitest";
import { runBoundedJevChoice, jevChoiceInputByteBudget } from "../src/server/jev/bounded-choice";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function options(count = 8, description = "A compact direction") {
  return {
    invocationId: "decision",
    label: "Choose direction",
    questionKey: "direction",
    question: "Choose the best supplied direction.",
    criteria: Object.fromEntries(
      Array.from({ length: count }, (_, i) => [`option-${i + 1}`, description]),
    ),
    state: (ids: readonly string[]) => ({
      originalIdea: "Explain an example system",
      comparedIds: ids,
    }),
    signal: new AbortController().signal,
    onEvent: vi.fn(),
  };
}
function response(payload: { questions: { direction: { criteria: Record<string, string> } } }) {
  const ids = Object.keys(payload.questions.direction.criteria);
  return new Response(
    JSON.stringify({
      model: "jev-test",
      answers: {
        direction: {
          type: "choice",
          choice: ids.at(-1),
          confidence: 0.9,
          probabilities: Object.fromEntries(ids.map((id) => [id, id === ids.at(-1) ? 1 : 0])),
        },
      },
      usage: { input_tokens: 10, output_tokens: 1 },
    }),
    { headers: { "content-type": "application/json" } },
  );
}
it("splits oversized comparisons before dispatch and presents every candidate to JEV", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");
  const seen = new Set<string>();
  const fetch = vi.fn(async (_url, init) => {
    const payload = JSON.parse(init.body);
    expect(Buffer.byteLength(init.body, "utf8")).toBeLessThanOrEqual(jevChoiceInputByteBudget);
    const ids = Object.keys(payload.questions.direction.criteria);
    expect(payload.state.comparedIds).toEqual(ids);
    ids.forEach((id) => seen.add(id));
    return response(payload);
  });
  vi.stubGlobal("fetch", fetch);
  const result = await runBoundedJevChoice(options(8, "x".repeat(6000)));
  expect(result.answer.choice).toBe("option-8");
  expect(seen.size).toBe(8);
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("splits a provider token-limit rejection, but propagates other errors", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");
  let first = true;
  const fetch = vi.fn(async (_url, init) => {
    if (first) {
      first = false;
      return new Response(JSON.stringify({ detail: { error_type: "max_tokens_exceeded" } }), {
        status: 400,
      });
    }
    return response(JSON.parse(init.body));
  });
  vi.stubGlobal("fetch", fetch);
  expect((await runBoundedJevChoice(options())).answer.choice).toBe("option-8");
  expect(fetch).toHaveBeenCalledTimes(4);
  fetch.mockImplementation(
    async () => new Response(JSON.stringify({ detail: "invalid question" }), { status: 400 }),
  );
  await expect(runBoundedJevChoice(options())).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(5);
});
it("refuses oversized irreducible context without sending it or silently dropping requirements", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const call = options(2);
  call.state = () => ({ originalIdea: "x".repeat(jevChoiceInputByteBudget), comparedIds: [] });
  await expect(runBoundedJevChoice(call)).rejects.toThrow("No request was sent");
  expect(fetch).not.toHaveBeenCalled();
});
it("honors cancellation before any dispatch", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  controller.abort(Error("Stopped"));
  await expect(runBoundedJevChoice({ ...options(), signal: controller.signal })).rejects.toThrow(
    "Stopped",
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("carries an uncontested subgroup into the finalist comparison without inventing a confidence", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");
  const fetch = vi.fn(async (_url, init) => {
    const payload = JSON.parse(init.body);
    expect(Object.keys(payload.questions.direction.criteria)).toHaveLength(2);
    return response(payload);
  });
  vi.stubGlobal("fetch", fetch);
  const result = await runBoundedJevChoice(options(3, "x".repeat(12000)));
  expect(result.answer.choice).toBe("option-3");
  expect(result.answer.confidence).toBe(0.9);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("keeps a near-tie Choice certainty distinct from the chosen probability and records the answer", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          model: "jev-test",
          answers: {
            direction: {
              type: "choice",
              choice: "option-1",
              confidence: 0.02,
              probabilities: { "option-1": 0.51, "option-2": 0.49 },
            },
          },
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
        { headers: { "content-type": "application/json" } },
      ),
  );
  const call = options(2);
  const result = await runBoundedJevChoice(call);
  expect(result.answer.confidence).toBe(0.02);
  expect(result.answer.probabilities["option-1"]).toBe(0.51);
  expect(result.comparedIds).toEqual(["option-1", "option-2"]);
  expect(call.onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "usage",
      data: expect.objectContaining({
        decision: {
          questionKey: "direction",
          answer: result.answer,
          comparedIds: result.comparedIds,
        },
      }),
    }),
  );
});
