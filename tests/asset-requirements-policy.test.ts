import { expect, it } from "vitest";
import {
  assetQuestionBuildScope,
  assetIdsForQuestionScope,
  assetRequirementsPolicy,
} from "../src/shared/asset-requirements-policy";
import { AssetNeedSchema } from "../src/shared/agents/schemas/asset-needs";

it("keeps optional inputs separate from actual capability needs, including future voice", () => {
  expect(assetRequirementsPolicy.collectNeeds([{}, { missingAssets: [] }])).toEqual([]);
  expect(
    assetRequirementsPolicy.collectNeeds([
      { missingAssets: ["Instrumental soundtrack (none supplied; beat accents are planned only)"] },
    ]),
  ).toEqual([]);
  expect(assetRequirementsPolicy.requirements.voice).toMatchObject({
    optional: true,
    section: "music",
  });
  expect(assetRequirementsPolicy.guidance).toContain("A soundtrack is actual audio");
  expect(assetRequirementsPolicy.rankingGuidance).toContain("Video previews are silent");
});
it("preserves precise questions and deduplicates needs across candidate directions", () => {
  const need = AssetNeedSchema.parse({
    kind: "soundtrack",
    cause: "tool-capability",
    reason: "The requested audio generator is unavailable.",
    question: "Upload a soundtrack or continue without audio?",
    fallback: "Continue without audio.",
  });
  expect(
    assetRequirementsPolicy.collectNeeds([{ assetNeeds: [need] }, { assetNeeds: [need] }]),
  ).toEqual([need]);
});
it("adapts old cached missing-asset strings without blocking or losing the upload category", () => {
  const needs = assetRequirementsPolicy.collectNeeds([
    {
      missingAssets: [
        "Instrumental soundtrack generator unavailable",
        "Website capture failed",
        "Voice recording missing",
        "Voice generation tools unavailable",
      ],
    },
    { missingAssets: ["Instrumental soundtrack", "Required photograph", "Document not provided"] },
  ]);
  expect(needs.map((need) => need.kind)).toEqual(["soundtrack", "urls", "voice"]);
  expect(needs.every((need) => AssetNeedSchema.safeParse(need).success)).toBe(true);
});
it("passes only answered decisions to the next build", () => {
  const need = {
    kind: "voice" as const,
    reason: "No voice generator",
    question: "Continue with captions?",
    fallback: "Use captions.",
  };
  expect(assetRequirementsPolicy.answerGuidance([{ ...need, id: "open", state: "open" }])).toBe("");
  expect(
    assetRequirementsPolicy.answerGuidance([
      {
        ...need,
        id: "answered",
        state: "answered",
        answer: "Use captions",
        assetIds: ["uploaded-reference"],
      },
    ]),
  ).toContain("uploaded-reference");
});

it("asks only for recorded capability or URL access failures, never reference improvements", () => {
  const reference = {
    kind: "images" as const,
    reason: "A photograph would improve fidelity.",
    question: "Upload a better photograph?",
    fallback: "Use code visuals.",
  };
  expect(assetRequirementsPolicy.collectNeeds([{ assetNeeds: [reference] }])).toEqual([]);
  const failures = [
    {
      ...reference,
      cause: "model-capability" as const,
      reason: "The model and available tools cannot generate the requested photograph.",
    },
    {
      ...reference,
      kind: "urls" as const,
      cause: "url-access" as const,
      reason: "The supplied website denies access through available tools.",
    },
  ];
  expect(assetRequirementsPolicy.collectNeeds([{ assetNeeds: failures }])).toEqual(failures);
  expect(AssetNeedSchema.safeParse({ ...reference, cause: "missing-upload" }).success).toBe(false);
  expect(assetRequirementsPolicy.guidance).toContain("First consider all available tools");
});

it("keeps result decisions within their owning build or selected preview lineage", () => {
  const base = {
    kind: "reference" as const,
    reason: "Renderer unavailable",
    question: "Use approximation?",
    fallback: "Use code",
    state: "answered" as const,
  };
  const questions = [
    { ...base, id: "main", answer: "General preference" },
    { ...base, id: "a", jobId: "preview-a", answer: "Direction A only" },
    { ...base, id: "b", jobId: "preview-b", answer: "Direction B only" },
    { ...base, id: "full", jobId: "full-a", answer: "Full result only" },
  ];
  const preview = assetRequirementsPolicy.answerGuidance(questions, ["preview-a"]);
  expect(preview).toContain("General preference");
  expect(preview).toContain("Direction A only");
  expect(preview).not.toContain("Direction B only");
  expect(preview).not.toContain("Full result only");
  const full = assetRequirementsPolicy.answerGuidance(questions, ["full-a", "preview-a"]);
  expect(full).toContain("Full result only");
  expect(full).toContain("Direction A only");
  expect(full).not.toContain("Direction B only");
});

it("inherits decisions along the selected result lineage and isolates uploaded references", () => {
  const jobs = [
    { id: "preview-a", candidateId: "a", kind: "preview" },
    { id: "preview-b", candidateId: "b", kind: "preview" },
    { id: "full-a", candidateId: "a", kind: "full" },
    { id: "refined-a", candidateId: "a", kind: "full", sourceJobId: "full-a" },
  ];
  const scope = assetQuestionBuildScope(jobs[3], jobs);
  expect(scope).toEqual(["refined-a", "full-a", "preview-a"]);
  const base = {
    kind: "images" as const,
    reason: "Image unavailable",
    question: "Supply image?",
    fallback: "Use code",
    state: "answered" as const,
  };
  expect(
    assetIdsForQuestionScope(
      ["original", "a", "b", "shared"],
      [
        { ...base, id: "a", jobId: "preview-a", assetIds: ["a", "shared"] },
        { ...base, id: "b", jobId: "preview-b", assetIds: ["b", "shared"] },
      ],
      scope,
    ),
  ).toEqual(["original", "a", "shared"]);
  expect(
    assetQuestionBuildScope({ id: "cycle", candidateId: "a", sourceJobId: "cycle" }, []),
  ).toEqual(["cycle"]);
});
