import { afterEach, expect, it, vi } from "vitest";
import {
  selectAuthoringResources,
  authoringResources,
} from "../src/server/jev/strategies/visual-authoring";
import { RequestSchema } from "../src/shared/contracts";
import { loadCatalog } from "../src/server/catalog/catalog";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function input() {
  const catalog = await loadCatalog();
  return {
    request: RequestSchema.parse({
      instructions: "Explain a concept without people",
      selectedStyleIds: ["style-026"],
      requirements: {
        main: {},
        music: {},
        urls: {},
        images: { instructions: "Keep the exact visual direction." },
      },
      candidateCount: 0,
    }),
    brief: {
      subject: "An API becomes clear",
      audience: "Engineers",
      objective: "Explain",
      previewBeat: "A request returns",
      facts: [],
      exactCopy: [],
      assetDescriptions: [],
      constraints: [],
    },
    candidate: {
      id: "direction",
      primaryStyleId: "style-026",
      supportingStyleIds: [],
      sceneRoles: [],
      rationale: "Clear",
      feasible: true,
      missingAssets: [],
      score: 0,
      confidence: 1,
      dimensions: {},
    },
    styles: catalog.styles,
    signal: new AbortController().signal,
    onEvent: vi.fn(),
  };
}
it.each(["animate_ui", "react_bits", "anatomy", "local_code"])(
  "uses the native Choice API winner %s, preserving renderer, MGs and usage attribution",
  async (winner) => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const body = JSON.parse(String(options.body));
        expect(body.model).toBe("jev-1.14.0");
        expect(body.state.selected.primary).toBe("style-026");
        expect(body.state).not.toHaveProperty("evidence");
        expect(body.state.visualInstructions).toBe("Keep the exact visual direction.");
        expect(body.state.instructions).toBe("Explain a concept without people");
        for (const resource of authoringResources) {
          const description = body.questions.resource.criteria[resource.id];
          expect(description).toBe(resource.guidance);
          expect(description).toContain("Advantages / best fit:");
          expect(description).toContain("Disadvantages / poor fit:");
          expect(description).toContain("Video adaptation:");
        }
        expect(body.questions.resource.criteria.anatomy).toContain("SVG/HTML");
        expect(body.questions.resource.criteria.local_code).toContain(
          "Pre-authored component effects",
        );
        expect(body.state.renderer.id).toBe("hyperframes");
        expect(body.state.renderer.visuals.frameContract).toContain("GSAP");
        expect(body.state.renderer.audio.generatesMusic).toBe(false);
        expect(body.state.policy).toContain("Do not change selected styles");
        expect(body.state.resources.map((r: { id: string }) => r.id)).toEqual(
          authoringResources.map((r) => r.id),
        );
        expect(Object.keys(body.questions)).toEqual(["resource"]);
        expect(body.questions.resource.type).toBe("choice");
        expect(Object.keys(body.questions.resource.criteria)).toEqual(
          authoringResources.map((r) => r.id),
        );
        return new Response(
          JSON.stringify({
            model: "jev-test",
            answers: {
              resource: {
                type: "choice",
                choice: winner,
                confidence: 0.4,
                probabilities: Object.fromEntries(
                  authoringResources.map(({ id }) => [id, id === winner ? 0.4 : 0.2]),
                ),
              },
            },
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }),
    );
    const options = await input();
    const before = structuredClone(options.request);
    const result = await selectAuthoringResources(options);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ source: "jev", selectedIds: [winner] });
    expect(
      result.decisions.filter((decision) => decision.use).map((decision) => decision.id),
    ).toEqual([winner]);
    expect(result.decisions.find((decision) => decision.id === winner)?.probability).toBe(0.4);
    expect(options.request).toEqual(before);
    const invocation = options.onEvent.mock.calls.find(([e]) => e.type === "invocation")![0];
    const usage = options.onEvent.mock.calls.find(([e]) => e.type === "usage")![0];
    expect(usage.data).toMatchObject({
      provider: "jev",
      invocationId: invocation.data.invocationId,
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  },
);
it("does not block production on unavailable JEV and does not swallow cancellation", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "");
  vi.stubEnv("JEV_API_KEY", "");
  const options = await input();
  expect(await selectAuthoringResources(options)).toMatchObject({
    source: "unavailable",
    selectedIds: [],
  });
  expect(options.onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "warning" }));
  const controller = new AbortController();
  controller.abort(Error("Cancelled"));
  await expect(selectAuthoringResources({ ...options, signal: controller.signal })).rejects.toThrow(
    "Cancelled",
  );
});
it.each([
  {},
  { resource: { type: "choice", choice: "unknown", confidence: 1, probabilities: {} } },
  {
    resource: {
      type: "choice",
      choice: "react_bits",
      confidence: 0.4,
      probabilities: { react_bits: 0.4 },
    },
  },
])(
  "never accepts a malformed JEV answer as a successful resource decision: %j",
  async (answers) => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ model: "jev-test", answers, usage: {} }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    expect(await selectAuthoringResources(await input())).toMatchObject({
      source: "unavailable",
      selectedIds: [],
    });
  },
);
