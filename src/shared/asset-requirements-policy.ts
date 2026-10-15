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
  id: string;
  jobId?: string;
  state: "open" | "answered";
  answer?: string;
  assetIds?: string[];
}

export const assetRequirementsPolicy = {
  requirements: optionalRequirements,
  guidance:
    "OPTIONAL ASSET POLICY: Requirements describe creative intent; documents, images, audio, voice recordings and URL captures are optional inputs, not mandatory uploads. Inspect and understand supplied material before using it. Without uploads, derive content from the brief and create appropriate visuals and a soundtrack with available local tools and code. A soundtrack is actual audio, not merely a beat plan or an animation. Never claim audio, speech, real photographs or website views were created when they were not. If URL exploration fails, or tools cannot produce a requested soundtrack or voice, return an assetNeeds entry with kind, cause (model-capability, tool-capability or url-access), a specific reason, a concise customer-facing question and an honest fallback. Ask only when the model and available tools cannot fulfil a requested requirement, including an inaccessible supplied URL. First consider all available tools and accessible supplied URLs. Missing optional uploads and opportunities to improve fidelity do not warrant questions. Record the actual capability or URL-access failure in cause and reason; do not return assetNeeds for absence alone. Default mode is optional: continue with the fallback. Use mode blocking only when an actual capability failure requires a user decision because the fallback would violate an explicit requirement. Missing optional uploads never justify blocking. Blocking pauses at the next workflow checkpoint. Silent video previews do not require soundtrack or voice. Keep optional limitations in assetNeeds, not missingAssets; missingAssets must never be a list of uploads the user did not promise to supply. Preserve explicit creative constraints and report any conflict rather than inventing evidence.",
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
          needs.set(need.kind, need);
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
