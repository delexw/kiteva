import {
  BriefAssetReviewSchema,
  type BriefAssetPlan,
} from "../src/shared/agents/schemas/brief-assets";
import { expect, it, vi, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { RequestSchema } from "../src/shared/contracts";

vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import {
  reviewBriefAssets,
  validateBriefAssetPlan,
} from "../src/server/jobs/subworkflows/brief-asset-review";
const plan: BriefAssetPlan = {
  coreIdea: "Explain the image import workflow",
  scenes: [
    {
      id: "import",
      purpose: "Show image import",
      assetPaths: ["assets/reference.txt"],
      use: "Extract verified import steps into an explanatory scene",
      coverage: "supported",
      limitation: "",
    },
  ],
  assets: [
    {
      path: "assets/reference.txt",
      sceneIds: ["import"],
      observedContent: "The document explains image import",
      relevance: "Supports the core workflow",
      suitability: "verified",
      plannedUse: "Use verified import steps",
      limitation: "",
    },
  ],
  limitations: [],
};
afterEach(() => vi.resetAllMocks());
async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "brief-review-"));
  await mkdir(path.join(workspace, "assets"));
  await writeFile(
    path.join(workspace, "assets/reference.txt"),
    "Image import: upload a picture, choose a direction, then generate.",
  );
  await writeFile(
    path.join(workspace, "brief-attachments.json"),
    JSON.stringify({
      attachments: [
        {
          id: "attachment",
          originalPath: "assets/reference.txt",
          kind: "document",
          displayName: "Reference",
          textPath: "assets/reference.txt",
          status: "text_extracted",
        },
      ],
    }),
  );
  return {
    workspace,
    brief: { constraints: [] as string[], facts: ["Import images"] },
    sessionId: "original-preparation-session",
    request: RequestSchema.parse({
      instructions: "Explain image importing",
      assetIds: ["00000000-0000-4000-8000-000000000001"],
      provider: "claude",
    }),
    signal: new AbortController().signal,
    onEvent: vi.fn(),
  };
}
it.each([
  ["claude", "claude-haiku-5-5"],
  ["codex", "gpt-6-luna"],
] as const)(
  "independently reviews %s attachments and hands scene usage to generation",
  async (provider, model) => {
    const input = await fixture();
    try {
      vi.mocked(agentTurn).mockResolvedValue({ value: { status: "passed", plan, issues: [] } });
      const revise = vi.fn();
      const scheduleCalls = vi.fn();
      const schedule = async <R>(task: () => Promise<R>) => {
        scheduleCalls();
        return task();
      };
      const result = await reviewBriefAssets({
        ...input,
        request: { ...input.request, provider },
        revise,
        schedule,
      });
      expect(result.value.assetPlan).toEqual(plan);
      expect(result.sessionId).toBe(input.sessionId);
      expect(revise).not.toHaveBeenCalled();
      expect(scheduleCalls).toHaveBeenCalledOnce();
      expect(agentTurn).toHaveBeenCalledWith(expect.objectContaining({ model, readOnly: true }));
      expect(vi.mocked(agentTurn).mock.calls[0][0].prompt).toContain("independently inspect");
    } finally {
      await rm(input.workspace, { recursive: true, force: true });
    }
  },
);
it("repairs concrete defects in the original preparation session then independently rechecks", async () => {
  const input = await fixture();
  try {
    const issue = {
      sceneId: "import",
      assetPath: "assets/reference.txt",
      issue: "The draft invents an automatic billing capability absent from the source",
      expectedFix: "Remove unsupported billing and extract the actual image import steps",
      acceptanceCriteria: "The core scene describes only the documented importing workflow",
    };
    vi.mocked(agentTurn)
      .mockResolvedValueOnce({ value: { status: "needs_repair", plan, issues: [issue] } })
      .mockResolvedValueOnce({ value: { status: "passed", plan, issues: [] } });
    const revise = vi.fn(async () => ({
      value: { ...input.brief, facts: ["Upload a picture", "Choose a direction"] },
      sessionId: input.sessionId,
    }));
    const result = await reviewBriefAssets({ ...input, revise });
    expect(revise).toHaveBeenCalledWith(
      input.brief,
      input.sessionId,
      expect.stringContaining(issue.expectedFix),
    );
    expect(result.value.facts).toEqual(["Upload a picture", "Choose a direction"]);
    expect(agentTurn).toHaveBeenCalledTimes(2);
  } finally {
    await rm(input.workspace, { recursive: true, force: true });
  }
});
it("records audio uncertainty and unused sources without inventing an asset failure", () => {
  const limited = structuredClone(plan);
  limited.assets[0].suitability = "limited";
  limited.assets[0].limitation = "Mood and vocals have not been verified by listening";
  limited.scenes[0].coverage = "limited";
  limited.scenes[0].limitation =
    "Use only as the user-requested soundtrack; semantic audio properties are unknown";
  expect(() => validateBriefAssetPlan(limited, ["assets/reference.txt"])).not.toThrow();
  expect(
    BriefAssetReviewSchema.safeParse({ status: "passed", plan: limited, issues: [] }).success,
  ).toBe(true);
});
it("rejects missing, invented, conflicting and unexplained source mappings", () => {
  expect(() => validateBriefAssetPlan(plan, ["assets/reference.txt", "assets/other.txt"])).toThrow(
    "every provided source",
  );
  const unknown = structuredClone(plan);
  unknown.assets[0].path = "assets/invented.png";
  expect(() => validateBriefAssetPlan(unknown, ["assets/reference.txt"])).toThrow();
  const conflict = structuredClone(plan);
  conflict.assets[0].sceneIds = [];
  expect(() => validateBriefAssetPlan(conflict, ["assets/reference.txt"])).toThrow("must agree");
  const limited = structuredClone(plan);
  limited.assets[0].suitability = "limited";
  expect(() => validateBriefAssetPlan(limited, ["assets/reference.txt"])).toThrow("limitation");
});
it("bounds unresolved defects and never reuses a partially reviewed brief", async () => {
  const input = await fixture();
  try {
    vi.mocked(agentTurn).mockResolvedValue({
      value: {
        status: "needs_repair",
        plan,
        issues: [
          {
            sceneId: "import",
            assetPath: "assets/reference.txt",
            issue: "The required source remains unsuitable for the core scene",
            expectedFix: "Replace the source with verified import evidence",
            acceptanceCriteria: "The source explicitly supports the main scene",
          },
        ],
      },
    });
    const revise = vi.fn(async () => ({ value: input.brief, sessionId: input.sessionId }));
    await expect(reviewBriefAssets({ ...input, revise })).rejects.toThrow("unresolved");
    expect(revise).toHaveBeenCalledTimes(20);
    expect(agentTurn).toHaveBeenCalledTimes(21);
  } finally {
    await rm(input.workspace, { recursive: true, force: true });
  }
});
it("skips attachment review when there are no supplied attachments or reference URLs", async () => {
  const request = RequestSchema.parse({ instructions: "Explain an abstract idea" });
  const brief = { constraints: [] };
  expect(
    await reviewBriefAssets({
      brief,
      request,
      workspace: "/tmp/unused",
      signal: new AbortController().signal,
      onEvent: vi.fn(),
      revise: vi.fn(),
    }),
  ).toMatchObject({ value: brief });
  expect(agentTurn).not.toHaveBeenCalled();
});
it("corrects malformed review mappings in the cheap review session before sending real defects to preparation", async () => {
  const input = await fixture();
  try {
    const malformed = structuredClone(plan);
    malformed.assets.push({
      ...malformed.assets[0],
      path: "input.json",
      sceneIds: [],
      suitability: "unused",
    });
    const issue = {
      sceneId: "import",
      assetPath: "assets/reference.txt",
      issue: "Unsupported claim",
      expectedFix: "Remove the unsupported claim",
      acceptanceCriteria: "Only supported facts remain",
    };
    vi.mocked(agentTurn)
      .mockResolvedValueOnce({
        value: { status: "needs_repair", plan: malformed, issues: [issue] },
        sessionId: "review-session",
      })
      .mockResolvedValueOnce({
        value: { status: "needs_repair", plan, issues: [issue] },
        sessionId: "review-session",
      })
      .mockResolvedValueOnce({
        value: { status: "passed", plan, issues: [] },
        sessionId: "next-review-session",
      });
    const revise = vi.fn(async () => ({ value: input.brief, sessionId: input.sessionId }));
    await reviewBriefAssets({ ...input, revise });
    const correction = vi.mocked(agentTurn).mock.calls[1][0];
    expect(correction.sessionId).toBe("review-session");
    expect(correction.model).toBe("claude-haiku-5-5");
    expect(correction.readOnly).toBe(true);
    expect(correction.prompt).toContain('Invalid extra assets: ["input.json"]');
    expect(correction.prompt).toContain("Expected fix:");
    expect(correction.prompt).toContain("Acceptance criteria:");
    expect(correction.prompt).toContain("must not change needs_repair to passed without evidence");
    expect(revise).toHaveBeenCalledWith(
      input.brief,
      input.sessionId,
      expect.stringContaining(issue.expectedFix),
    );
    expect(agentTurn).toHaveBeenCalledTimes(3);
  } finally {
    await rm(input.workspace, { recursive: true, force: true });
  }
});
it("bounds malformed review corrections without silently accepting or modifying the brief", async () => {
  const input = await fixture();
  try {
    vi.mocked(agentTurn).mockResolvedValue({
      value: { status: "passed", plan: { ...plan, assets: [] }, issues: [] },
      sessionId: "review-session",
    });
    const revise = vi.fn();
    await expect(reviewBriefAssets({ ...input, revise })).rejects.toThrow("Missing assets");
    expect(agentTurn).toHaveBeenCalledTimes(3);
    expect(revise).not.toHaveBeenCalled();
  } finally {
    await rm(input.workspace, { recursive: true, force: true });
  }
});
it("accepts a passing review after the twentieth brief repair", async () => {
  const input = await fixture();
  try {
    const unresolved = {
      status: "needs_repair",
      plan,
      issues: [
        {
          sceneId: "import",
          assetPath: "assets/reference.txt",
          issue: "Scene coverage remains incomplete",
          expectedFix: "Use the supported import workflow",
          acceptanceCriteria: "All scene claims are supported",
        },
      ],
    };
    for (let attempt = 0; attempt < 20; attempt++)
      vi.mocked(agentTurn).mockResolvedValueOnce({ value: unresolved });
    vi.mocked(agentTurn).mockResolvedValueOnce({ value: { status: "passed", plan, issues: [] } });
    const revise = vi.fn(async () => ({ value: input.brief, sessionId: input.sessionId }));
    const result = await reviewBriefAssets({ ...input, revise });
    expect(result.value.assetPlan).toEqual(plan);
    expect(revise).toHaveBeenCalledTimes(20);
    expect(agentTurn).toHaveBeenCalledTimes(21);
  } finally {
    await rm(input.workspace, { recursive: true, force: true });
  }
});
it("sends one issue per repair and supplies the before-state for independent regression review", async () => {
  const input = await fixture();
  try {
    const first = {
      sceneId: "import",
      assetPath: "assets/reference.txt",
      issue: "The import description is unsupported",
      expectedFix: "Correct only the import description",
      acceptanceCriteria: "Import facts match the document",
    };
    const second = {
      ...first,
      sceneId: "another-scene",
      issue: "Another scene has an unrelated defect",
      expectedFix: "Correct the unrelated scene separately",
    };
    vi.mocked(agentTurn)
      .mockResolvedValueOnce({ value: { status: "needs_repair", plan, issues: [first, second] } })
      .mockResolvedValueOnce({ value: { status: "passed", plan, issues: [] } });
    const revise = vi.fn(
      async (_brief: typeof input.brief, _sessionId: string | undefined, _feedback: string) => ({
        value: { ...input.brief, facts: ["Verified import workflow"] },
        sessionId: input.sessionId,
      }),
    );
    await reviewBriefAssets({ ...input, revise });
    const feedback = JSON.parse(revise.mock.calls[0][2]);
    expect(feedback.issue).toEqual(first);
    expect(feedback.issues).toBeUndefined();
    expect(JSON.stringify(feedback)).not.toContain(second.issue);
    expect(feedback.preservation).toContain("unchanged");
    const evidence = JSON.parse(
      await readFile(path.join(input.workspace, "brief-asset-review-input.json"), "utf8"),
    );
    expect(evidence.previousRepair.briefBeforeRepair).toEqual(input.brief);
    expect(evidence.previousRepair.issue).toEqual(first);
    expect(vi.mocked(agentTurn).mock.calls[1][0].prompt).toContain(
      "Prioritize regressions to unrelated scenes",
    );
  } finally {
    await rm(input.workspace, { recursive: true, force: true });
  }
});
