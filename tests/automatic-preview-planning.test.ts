import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import {
  runAutomaticPreviewWorkflow,
  validateAutomaticPreviewPlan,
} from "../src/server/jobs/subworkflows/automatic-preview/workflow";
import { RequestSchema, type StyleCandidate } from "../src/shared/contracts";
import { BriefSchema } from "../src/shared/agents/schemas/video";
import { automaticPreviewResult } from "./fixtures/automatic-preview-plan";

const brief = BriefSchema.parse({
  subject: "A product",
  audience: "New users",
  objective: "Explain",
  facts: [],
  exactCopy: [],
  previewBeat: "A source becomes a result",
  assetDescriptions: [],
  constraints: [],
  suggestedDuration: 30,
  durationReason: "A short explanation",
});
const candidates: StyleCandidate[] = [0, 1].map((index) => ({
  id: `direction-${index}`,
  primaryStyleId: `style-00${index + 1}`,
  supportingStyleIds: [],
  sceneRoles: [],
  rationale: "Selected combination",
  feasible: true,
  missingAssets: [],
  score: index * 10,
  confidence: 0.7,
  dimensions: { relevance: 70 },
}));

it.each(
  (["claude", "codex"] as const).flatMap((provider) =>
    (["context", "creative", "random"] as const).map((preference) => ({ provider, preference })),
  ),
)(
  "$provider $preference plans all fixed directions in one independent call",
  async ({ provider, preference }) => {
    vi.mocked(agentTurn)
      .mockReset()
      .mockImplementation(async (call) => automaticPreviewResult(call.promptContext));
    const workspace = await mkdtemp(path.join(os.tmpdir(), "shared-preview-plan-"));
    const original = structuredClone(candidates);
    try {
      const request = RequestSchema.parse({
        instructions: "Explain a product",
        provider,
        preference,
        candidateCount: 2,
      });
      const result = await runAutomaticPreviewWorkflow({
        request,
        brief,
        candidates,
        workspace,
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      });
      expect(agentTurn).toHaveBeenCalledOnce();
      const call = vi.mocked(agentTurn).mock.calls[0][0];
      expect(call).toMatchObject({ provider, readOnly: true, includeCreativeAlternatives: false });
      expect(call.sessionId).toBeUndefined();
      expect(result.directions.map((direction) => direction.id)).toEqual(
        candidates.map((candidate) => candidate.id),
      );
      expect(candidates).toEqual(original);
      const guidance = await readFile(path.join(workspace, "PREVIEW_PLANNING.md"), "utf8");
      expect(guidance).toContain(
        "Keep every supplied direction ID and style combination unchanged",
      );
      expect(guidance).toContain("one representative three-second previewBeat");
      expect(call.prompt.length).toBeLessThan(1200);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);

it("rejects missing, duplicate or invented direction IDs", () => {
  const plan = automaticPreviewResult({ brief, directions: candidates }).value;
  expect(() => validateAutomaticPreviewPlan(plan, candidates)).not.toThrow();
  for (const ids of [
    ["direction-0"],
    ["direction-0", "direction-0"],
    ["direction-0", "invented"],
  ]) {
    expect(() =>
      validateAutomaticPreviewPlan(
        { ...plan, directions: ids.map((id) => ({ ...plan.directions[0], id })) },
        candidates,
      ),
    ).toThrow("exactly once");
  }
});

it("does not start planning after caller cancellation", async () => {
  vi.mocked(agentTurn).mockReset();
  await expect(
    runAutomaticPreviewWorkflow({
      request: RequestSchema.parse({ instructions: "Explain a product" }),
      brief,
      candidates,
      workspace: "unused",
      signal: AbortSignal.abort(),
      onEvent: vi.fn(),
    }),
  ).rejects.toThrow();
  expect(agentTurn).not.toHaveBeenCalled();
});
