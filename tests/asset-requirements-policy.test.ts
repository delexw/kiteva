import { expect, it } from "vitest";
import {
  assetQuestionBuildScope,
  assetIdsForQuestionScope,
  assetRequirementsPolicy,
  referenceFailureGuidance,
  customerQuestionGuidance,
  matchesAssetQuestion,
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
it("pauses for verified legacy capability questions without turning missing uploads into questions", () => {
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
  expect(needs.every((need) => need.mode === "blocking")).toBe(true);
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
  expect(assetRequirementsPolicy.collectNeeds([{ assetNeeds: failures }])).toEqual(
    failures.map((need) => ({ ...need, mode: "blocking" })),
  );
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

it("never treats an optional model question as permission to use its fallback", () => {
  const need = {
    mode: "optional" as const,
    kind: "urls" as const,
    cause: "url-access" as const,
    reason: "The supplied website cannot be accessed.",
    question: "Use an alternative reference?",
    fallback: "Use the supplied description.",
  };
  expect(assetRequirementsPolicy.collectNeeds([{ assetNeeds: [need] }])).toEqual([
    { ...need, mode: "blocking" },
  ]);
  expect(need.mode).toBe("optional");
  expect(assetRequirementsPolicy.guidance).toContain(
    "never continue with a proposed fallback without explicit acceptance",
  );
});

it("supplies the same nontechnical question policy to model instructions and structured question fields", () => {
  expect(assetRequirementsPolicy.guidance).toContain(customerQuestionGuidance);
  expect(AssetNeedSchema.shape.question.description).toBe(customerQuestionGuidance);
  expect(AssetNeedSchema.shape.reason.description).toContain(customerQuestionGuidance);
  expect(AssetNeedSchema.shape.fallback.description).toContain(
    "what the user will see or hear differently",
  );
  expect(customerQuestionGuidance).toContain("no knowledge of internal JSON");
  expect(customerQuestionGuidance).toContain("Use the existing repair workflow");
  expect(customerQuestionGuidance).toContain("not a customer decision");
});

it("deduplicates only the same scoped need, preserving answered decisions without hiding new issues", () => {
  const need = AssetNeedSchema.parse({
    kind: "reference",
    cause: "tool-capability",
    reason: "An export is unavailable",
    question: "Use the preview instead?",
    fallback: "Use the preview",
  });
  const answered = { ...need, id: "old", jobId: "film", state: "answered" as const };
  expect(matchesAssetQuestion(answered, need, "film")).toBe(true);
  expect(matchesAssetQuestion({ ...answered, state: "open" }, need, "film")).toBe(true);
  expect(
    matchesAssetQuestion(
      answered,
      { ...need, reason: "The recording is clipped", question: "Supply another recording?" },
      "film",
    ),
  ).toBe(false);
  expect(matchesAssetQuestion(answered, need, "another-film")).toBe(false);
  expect(matchesAssetQuestion(answered, need)).toBe(false);
});

it("keeps reference failures scoped to dependent details without losing the idea", () => {
  expect(assetRequirementsPolicy.guidance).toContain(referenceFailureGuidance);
  expect(referenceFailureGuidance).toContain("skip only that reference and details requiring it");
  expect(referenceFailureGuidance).toContain(
    "Preserve the original idea, subject identity and remaining requirements",
  );
  expect(referenceFailureGuidance).toContain(
    "do not invent evidence or redirect the creative concept",
  );
  expect(assetRequirementsPolicy.guidance).toContain(
    "failed URL exploration prevents an explicitly required result",
  );
  expect(referenceFailureGuidance).not.toMatch(/TeamTube|style-\d+|motion-\d+/);
});
