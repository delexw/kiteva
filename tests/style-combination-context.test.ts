import { expect, it } from "vitest";
import { styleCombinationRankingBrief } from "../src/server/jev/strategies/style-combination-context";
import type { ContentBrief } from "../src/shared/contracts";

it("preserves original brief content without sending a separate production plan or asset evidence map", () => {
  const brief: ContentBrief = {
    subject: "Example",
    audience: "Learners",
    objective: "Understand the system",
    facts: ["Verified fact"],
    exactCopy: ["Exact title"],
    previewBeat: "Explain the core idea",
    assetDescriptions: ["Observed reference content"],
    constraints: ["No fabricated features"],
    assetPlan: {
      coreIdea: "Repeated core idea",
      limitations: ["Source repository not verified"],
      scenes: [
        {
          id: "opening",
          purpose: "Production purpose",
          use: "Production staging",
          assetPaths: ["assets/reference.png"],
          coverage: "limited",
          limitation: "Source coverage is incomplete",
        },
      ],
      assets: [
        {
          path: "assets/reference.png",
          sceneIds: ["opening"],
          observedContent: "Long production evidence",
          relevance: "Repeated relevance",
          plannedUse: "Production instruction",
          suitability: "limited",
          limitation: "Only a screenshot is available",
        },
      ],
    },
  };
  const original = structuredClone(brief);
  const ranked = styleCombinationRankingBrief(brief);
  expect(ranked).toMatchObject({
    facts: brief.facts,
    constraints: brief.constraints,
    exactCopy: brief.exactCopy,
    assetDescriptions: brief.assetDescriptions,
  });
  const expected = { ...original };
  delete expected.assetPlan;
  expect(ranked).toEqual(expected);
  expect(ranked).not.toHaveProperty("assetEvidence");
  expect(ranked).not.toHaveProperty("assetPlan");
  expect(JSON.stringify(ranked)).not.toContain("Production staging");
  expect(brief).toEqual(original);
});

it("requires model-authored asset evidence inside each complete combination brief", async () => {
  const { ProposalSchema } = await import("../src/shared/agents/schemas/proposals");
  const {
    compactDirectionProposalGuidance,
    combinationAssetEvidenceGuidance,
    combinationProposalPolicyRevision,
  } = await import("../src/shared/style-combinations");
  expect(ProposalSchema.shape.options.element.shape.rationale.description).toBe(
    combinationAssetEvidenceGuidance,
  );
  expect(compactDirectionProposalGuidance).toContain(combinationAssetEvidenceGuidance);
  for (const term of [
    "coverage",
    "suitability",
    "all applicable limitations",
    "verified",
    "unknown",
  ])
    expect(combinationAssetEvidenceGuidance).toContain(term);
  expect(combinationProposalPolicyRevision).toBeGreaterThan(5);
});
