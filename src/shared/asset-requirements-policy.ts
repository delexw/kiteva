const optionalRequirements = {
  voice: {
    optional: true,
    section: "music",
    accept: ".wav,.mp3,.m4a",
    legacyPattern: /voice|speech|narration/i,
    fallback:
      "Use readable on-screen copy without speech when voice generation or a supplied recording is unavailable.",
  },
  documents: {
    optional: true,
    legacyPattern: /document|pdf|brief/i,
    section: "main",
    accept: ".md,.txt,.pdf",
    fallback: "Use the written brief and state factual limitations.",
  },
  images: {
    optional: true,
    legacyPattern: /image|photo|picture/i,
    section: "images",
    accept: ".png,.jpg,.jpeg,.webp,.gif,.svg",
    fallback: "Create suitable visuals with code; do not fabricate photographs or product screens.",
  },
  soundtrack: {
    optional: true,
    legacyPattern: /soundtrack|instrumental|music|audio/i,
    section: "music",
    accept: ".wav,.mp3,.m4a",
    fallback:
      "Build an original soundtrack with available local code and audio tools; if unavailable, continue without audio.",
  },
  urls: {
    optional: true,
    legacyPattern: /url|website|capture|screenshot/i,
    section: "images",
    accept: ".png,.jpg,.jpeg,.webp,.gif",
    fallback:
      "Use available material and code-created visuals; omit unverified website claims and views.",
  },
  reference: {
    optional: true,
    legacyPattern: /^$/i,
    section: "main",
    accept: ".md,.txt,.pdf",
    fallback: "Adapt the result to available material and explain the limitation.",
  },
} as const;

export const assetRequirementKinds = Object.keys(optionalRequirements) as [
  keyof typeof optionalRequirements,
  ...(keyof typeof optionalRequirements)[],
];
export type AssetRequirementKind = keyof typeof optionalRequirements;
export const assetNeedCauses = ["model-capability", "tool-capability", "url-access"] as const;
export type AssetNeedCause = (typeof assetNeedCauses)[number];
export interface AssetNeed {
  mode?: "optional" | "blocking";
  cause?: AssetNeedCause;
  kind: AssetRequirementKind;
  reason: string;
  question: string;
  fallback: string;
}
export interface AssetQuestion extends AssetNeed {
  createdAt?: string;
  answeredAt?: string;
  id: string;
  jobId?: string;
  state: "open" | "answered";
  answer?: string;
  assetIds?: string[];
}

/** An answered decision covers the same need, not every future issue in its category. */
export function matchesAssetQuestion(question: AssetQuestion, need: AssetNeed, jobId?: string) {
  return (
    question.jobId === jobId &&
    question.kind === need.kind &&
    question.cause === need.cause &&
    question.reason === need.reason &&
    question.question === need.question &&
    question.fallback === need.fallback
  );
}

export const customerQuestionGuidance =
  "CUSTOMER QUESTIONS: Assume the user knows their intended result but has no knowledge of internal JSON, manifests, schemas, validators, APIs, renderer contracts, source files or code. Write question, reason and fallback in plain language about the visible or audible result. Explain what cannot be delivered, its practical impact and the concrete choices available; make the alternative's tradeoff clear. Ask only for a creative preference, permission, required supplied material or another decision that belongs to the user. Keep internal diagnostics in technical logs and repair evidence. An omitted manifest field, code defect, validation mismatch or failed repair attempt is an internal repair problem, not a customer decision. Use the existing repair workflow; do not ask the user to choose an implementation, change validation rules or approve bypassing checks. Do not relabel an internal defect as a tool-capability failure. If a genuine capability limitation requires changing the requested result, ask about that result in everyday language. For example: 'The requested voice cannot be generated with the available tools. Would you like to upload a recording or use captions without speech?' Never ask whether a JSON field should be a duration contract.";

export const referenceFailureGuidance =
  "REFERENCE FAILURE: If a reference is unavailable, skip only that reference and details requiring it. Preserve the original idea, subject identity and remaining requirements. Report the limitation; do not invent evidence or redirect the creative concept around the failure.";

export const assetRequirementsPolicy = {
  requirements: optionalRequirements,
  guidance:
    customerQuestionGuidance +
    "\n" +
    referenceFailureGuidance +
    "\nOPTIONAL ASSET POLICY: Requirements describe creative intent; documents, images, audio, voice recordings and URL captures are optional inputs, not mandatory uploads. Inspect and understand supplied material before using it. Without uploads, derive content from the brief and create appropriate visuals and a soundtrack with available local tools and code. A soundtrack is actual audio, not merely a beat plan or an animation. Never claim audio, speech, real photographs or website views were created when they were not. If failed URL exploration prevents an explicitly required result, or tools cannot produce a requested soundtrack or voice, return an assetNeeds entry with kind, cause (model-capability, tool-capability or url-access), a specific reason, a concise customer-facing question and an honest fallback. Ask only when the model and available tools cannot fulfil a requested requirement, including an inaccessible supplied URL. First consider all available tools and accessible supplied URLs. Missing optional uploads and opportunities to improve fidelity do not warrant questions. Record the actual capability or URL-access failure in cause and reason; do not return assetNeeds for absence alone. Every customer-facing question requires a decision and pauses the affected work until the user answers. Set mode blocking; never continue with a proposed fallback without explicit acceptance. If no decision is needed, record a limitation rather than asking a question. Missing optional uploads never justify a question or a pause. When a decision becomes necessary, stop implementation and return assetNeeds in the required structured response immediately; do not continue rendering or ask only in progress prose. The application pauses before validation, rendering or review and resumes the same work with the answer. Silent video previews do not require soundtrack or voice. Record limitations that need no user decision in constraints or production notes, not assetNeeds; missingAssets must never be a list of uploads the user did not promise to supply. Preserve explicit creative constraints and report any conflict rather than inventing evidence.",
  rankingGuidance:
    "Evaluate the visual preview's feasibility with available material and code. Optional documents, images, soundtrack, voice and URL captures are not upload prerequisites. Video previews are silent: full-video audio availability is not a preview conflict. An optional asset can be adapted or omitted; ask a user question only when the model and available tools cannot fulfil the requirement, including inaccessible supplied URLs; do not reject an otherwise feasible direction for it. Reject actual visual contradictions or unavailable required rendering capabilities.",
  questionCauses: assetNeedCauses,
  collectNeeds(
    sources: Array<{ assetNeeds?: AssetNeed[]; missingAssets?: string[] }>,
  ): AssetNeed[] {
    const needs = new Map<AssetRequirementKind, AssetNeed>();
    for (const source of sources) {
      for (const need of source.assetNeeds || [])
        if (need.cause && this.questionCauses.includes(need.cause) && !needs.has(need.kind))
          needs.set(need.kind, { ...need, mode: "blocking" });
      for (const missing of source.missingAssets || []) {
        // Legacy absence reports are not evidence of a capability failure.
        const cause: AssetNeedCause | undefined =
          /(?:url|website|capture|screenshot).*(?:failed|unreachable|inaccessible|blocked)|(?:cannot|unable to) (?:access|explore|capture)/i.test(
            missing,
          )
            ? "url-access"
            : /(?:tool|generator|generation|capability|model).*(?:unavailable|unsupported|cannot|failed)|(?:cannot|unable to) (?:generate|produce|build|render)/i.test(
                  missing,
                )
              ? "tool-capability"
              : undefined;
        if (!cause) continue;
        const kind = (Object.entries(this.requirements).find(([, rule]) =>
          rule.legacyPattern.test(missing),
        )?.[0] || "reference") as AssetRequirementKind;
        if (needs.has(kind)) continue;
        needs.set(kind, {
          mode: "blocking",
          kind,
          cause,
          reason: missing,
          question: `Would you like to provide ${kind === "urls" ? "a website capture" : kind === "soundtrack" ? "an audio track" : kind === "voice" ? "a voice recording" : kind === "images" ? "an image" : "a reference"}, or continue with the alternative?`,
          fallback: this.requirements[kind].fallback,
        });
      }
    }
    return [...needs.values()];
  },
  answerGuidance(questions: AssetQuestion[] = [], jobIds: string[] = []): string {
    return questions
      .filter(
        (question) =>
          question.state === "answered" && (!question.jobId || jobIds.includes(question.jobId)),
      )
      .map(
        (question) =>
          `User decision (${question.kind}): ${question.answer || question.fallback}. Attached asset IDs: ${(question.assetIds || []).join(", ") || "none"}. Read style-context.json assetInputs for their paths; honor this decision for this build.`,
      )
      .join("\n");
  },
} as const;

export function assetQuestionBuildScope(
  job: { id: string; candidateId: string; sourceJobId?: string },
  jobs: Array<{ id: string; candidateId: string; sourceJobId?: string; kind: string }>,
): string[] {
  const ids = new Set([job.id]);
  let sourceId = job.sourceJobId;
  while (sourceId && !ids.has(sourceId)) {
    ids.add(sourceId);
    sourceId = jobs.find((source) => source.id === sourceId)?.sourceJobId;
  }
  for (const preview of jobs)
    if (preview.kind === "preview" && preview.candidateId === job.candidateId) ids.add(preview.id);
  return [...ids];
}

export function assetIdsForQuestionScope(
  assetIds: string[],
  questions: AssetQuestion[] = [],
  jobIds: string[],
): string[] {
  return assetIds.filter((id) => {
    const owners = questions.filter((question) => question.assetIds?.includes(id));
    return (
      !owners.length ||
      owners.some((question) => !question.jobId || jobIds.includes(question.jobId))
    );
  });
}
