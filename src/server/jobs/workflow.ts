import { relevantPreferenceHistory } from "../catalog/preference-history";
import { directionCandidateId, directionRoundSteps } from "../../shared/direction-rounds";
import { scopedAssetQuestions } from "../../shared/asset-question-scopes";
import { StyleSummarySchema } from "../../shared/agents/schemas/style-summary";
import { manualDirection } from "./manual-direction";
import { validateAssetLimits } from "../../shared/asset-limits";
import { RequestSchema } from "../../shared/contracts";
import { AssetQuestionAnswerSchema } from "../../shared/agents/schemas/asset-needs";
import { acceptsBriefAttachment } from "../../shared/brief-sections";
import {
  assetQuestionBuildScope,
  assetIdsForQuestionScope,
  assetRequirementsPolicy,
} from "../../shared/asset-requirements-policy";
import { PageBriefSchema, type PageBrief } from "../../shared/agents/schemas/page";
import { BriefSchema, type Brief } from "../../shared/agents/schemas/video";
import { proposalSchemaForStyleRange } from "../../shared/agents/schemas/proposals";
import { briefExplorationInstructions } from "../agents/brief-exploration";
import { candidateCopyGuidance } from "../../shared/candidate-copy";
import {
  reviewBriefAssets,
  briefAssetAlignmentPrinciple,
  briefAssetRepairScopeRule,
} from "./brief-asset-review";
import { z } from "zod";
import {
  combinationProposalPolicyRevision,
  suggestedCombinationGuidance,
} from "../../shared/style-combinations";
import { access, readdir, rm } from "node:fs/promises";
import {
  initializePreparation,
  preparationCheckpoint,
  preparationRequest,
} from "./preparation-checkpoints";
import { GeneratedLyricsSchema } from "../../shared/domains/video";
import { CodedError, errorCode } from "../../shared/errors";
import { prepareLyrics, resolvedLyricsRequest } from "../domains/video/prepare-lyrics";
import {
  MIN_AUTO_VIDEO_DURATION,
  MAX_VIDEO_DURATION,
  resolveVideoDuration,
  videoStyleCountRange,
} from "../../shared/domains/video";
import { generateVideo } from "../domains/video/workflow";
import { pageStyleContext } from "../domains/page/prompts";

import { generatePage } from "../domains/page/workflow";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile, readFile, copyFile, cp, symlink } from "node:fs/promises";
import {
  ReferenceScreenshotSchema,
  type ReferenceScreenshot,
  type PreparationStep,
  terminalPhases,
  type Run,
  type GenerationJob,
  type StyleCandidate,
  type CreativeRequest,
} from "../../shared/contracts.js";
import { Store } from "./store.js";
import type { Catalog } from "../catalog/catalog.js";
import { appRoot, dataRoot, models, safeMessage, agentMode } from "../runtime/config.js";
import { agentTurn, type ProviderEvent } from "../agents/providers.js";
import { combinationModels, textModels } from "../agents/models.js";
import { prepareStyleSummaries } from "../catalog/style-summaries";
import { rankOptions, jevClient } from "../catalog/ranking.js";
import { readReferenceScreenshots, referenceManifest } from "../requests/reference-browser-tools";
import { validateReferenceUrl } from "../requests/reference-url";
import {
  prepareBriefAttachments,
  briefAttachmentKind,
  briefAttachmentInstructions,
} from "../requests/brief-attachments";
import { prepareBriefImages } from "../requests/brief-images";
import { describeAsset } from "../requests/inputs.js";
import { WorkQueue } from "./queue.js";
import { makePlaybackCopies } from "../rendering/render";
import { playbackCopyProfile } from "../rendering/playback-copies";
import { InputRequired, blockingQuestions } from "../../shared/input-checkpoint";
export class Workflow {
  private agents = new WorkQueue(5);
  private renders = new WorkQueue(1);
  private controllers = new Map<string, AbortController>();
  private playbackCopies = new Map<
    string,
    { controller: AbortController; discard: boolean; done: Promise<void> }
  >();
  hasActiveTasks(run: Run) {
    return this.controllers.has(run.id) || run.jobs.some((job) => this.controllers.has(job.id));
  }
  constructor(
    readonly store: Store,
    readonly catalog: Catalog,
  ) {}
  private emit(run: Run, type: string, message: string, job?: GenerationJob, data?: unknown) {
    this.store.emit(run.id, type, message, job?.id, data);
  }
  answerAssetQuestion(run: Run, questionId: string, input: unknown) {
    const body = AssetQuestionAnswerSchema.parse(input);
    const question = run.assetQuestions?.find((item) => item.id === questionId);
    if (!question) throw new CodedError("NOT_FOUND", "Question not found", 404);
    if (question.state === "answered") return run;
    if (
      run.phase === "cancelled" ||
      (question.jobId && run.jobs.find((job) => job.id === question.jobId)?.phase === "cancelled")
    )
      throw new CodedError("INVALID_REQUEST", "This work was cancelled", 409);
    const section = assetRequirementsPolicy.requirements[question.kind].section;
    for (const id of body.assetIds) {
      const asset = this.store.getAsset(id);
      if (!asset || !acceptsBriefAttachment(section, asset.name))
        throw new CodedError(
          "FILE_TYPE_UNSUPPORTED",
          "Choose a supported reference for this question",
        );
    }
    const request = structuredClone(run.request);
    const added = body.assetIds.filter((id) => !request.assetIds.includes(id));
    request.assetIds = [...new Set([...request.assetIds, ...added])];
    validateAssetLimits(
      request.assetIds.map((id) => {
        const asset = this.store.getAsset(id);
        if (!asset) throw new CodedError("FILE_UNREADABLE", "Attachment not found");
        return asset;
      }),
    );
    if (added.length) {
      request.requirements ||= {
        main: { instructions: "", assetIds: [] },
        music: { instructions: "", assetIds: [] },
        images: { instructions: "", assetIds: [] },
        urls: { instructions: "" },
      };
      for (const id of added) {
        for (const name of ["main", "music", "images"] as const)
          request.requirements[name].assetIds = request.requirements[name].assetIds.filter(
            (existing) => existing !== id,
          );
        request.requirements[section].assetIds.push(id);
      }
    }
    run.request = RequestSchema.parse(request);
    question.state = "answered";
    question.answer =
      body.answer ||
      (body.assetIds.length ? "Use the newly supplied reference." : question.fallback);
    question.assetIds = added;
    this.update(run);
    this.resumeInputs(run);
    return run;
  }
  private inputCheckpoint(run: Run, job?: GenerationJob) {
    if (job?.phase === "ready") return;
    const blockers = blockingQuestions(run, job);
    if (!blockers.length) return;
    const wait = run.inputWaits?.find((item) => item.jobId === job?.id);
    const questionIds = [...new Set([...(wait?.questionIds || []), ...blockers.map((q) => q.id)])];
    if (wait) wait.questionIds = questionIds;
    else
      (run.inputWaits ||= []).push({
        checkpoint: job ? "generate" : "prepare",
        ...(job ? { jobId: job.id } : {}),
        questionIds,
      });
    this.store.save(run);
    this.emit(run, "state", "Waiting for your decision", job);
    throw new InputRequired();
  }
  private resumeInputs(run: Run) {
    if (run.phase === "cancelled") return;
    for (const wait of run.inputWaits || []) {
      const job = wait.jobId ? run.jobs.find((item) => item.id === wait.jobId) : undefined;
      if (
        (wait.jobId && (!job || job.phase === "cancelled")) ||
        blockingQuestions(run, job).length ||
        this.controllers.has(wait.jobId || run.id)
      )
        continue;
      run.inputWaits = run.inputWaits!.filter((item) => item !== wait);
      this.store.save(run);
      if (job) {
        const decisions = assetRequirementsPolicy.answerGuidance(
          scopedAssetQuestions(run).filter((q) => wait.questionIds?.includes(q.id)),
          assetQuestionBuildScope(job, run.jobs),
        );
        void this.generate(run, job, undefined, decisions).then(() => this.settleRun(run, job));
      } else void this.prepare(run);
    }
  }
  private settleRun(run: Run, job: GenerationJob) {
    if (run.phase === "cancelled" || run.inputWaits?.length || this.hasActiveTasks(run)) return;
    run.phase =
      job.kind === "full" || !run.jobs.some((item) => item.phase === "ready") ? job.phase : "ready";
    this.update(run);
  }
  private recordAssetNeeds(
    run: Run,
    sources: Parameters<typeof assetRequirementsPolicy.collectNeeds>[0],
    jobId?: string,
  ) {
    for (const need of assetRequirementsPolicy.collectNeeds(sources)) {
      if (
        run.assetQuestions?.some(
          (question) => question.kind === need.kind && question.jobId === jobId,
        )
      )
        continue;
      (run.assetQuestions ||= []).push({
        ...need,
        id: randomUUID(),
        state: "open",
        ...(jobId ? { jobId } : {}),
      });
    }
    this.update(run);
  }
  private update(run: Run) {
    for (const job of run.jobs) {
      const production = job.outputType === "page" ? job.pageProduction : job.production;
      for (const need of assetRequirementsPolicy.collectNeeds([production || {}])) {
        if (
          run.assetQuestions?.some(
            (question) => question.kind === need.kind && question.jobId === job.id,
          )
        )
          continue;
        (run.assetQuestions ||= []).push({
          ...need,
          id: randomUUID(),
          state: "open",
          jobId: job.id,
        });
      }
    }
    this.store.save(run);
    this.emit(run, "state", "Workflow updated");
  }
  private providerEvent(
    run: Run,
    job?: GenerationJob,
    purpose = job
      ? `${job.kind} ${job.outputType === "page" ? "HTML" : "video"} generation`
      : "Brief preparation",
  ) {
    return (e: ProviderEvent) => {
      const eventData = e.data as
        | {
            resultReview?: boolean;
            videoBuildPlanning?: boolean;
            correctionTier?: string;
            correctionFocus?: string;
            sessionId?: string;
          }
        | undefined;
      if (
        e.type === "session" &&
        job &&
        !eventData?.resultReview &&
        eventData?.correctionTier !== "cheap"
      ) {
        job.sessionId = (e.data as { sessionId: string }).sessionId;
        this.store.save(run);
      }
      this.emit(run, e.type, e.message, job, {
        ...(e.data as object),
        purpose: eventData?.videoBuildPlanning
          ? "Preview video planning"
          : eventData?.resultReview
            ? "Result quality review"
            : eventData?.correctionFocus
              ? `${eventData.correctionFocus} correction`
              : purpose,
        audience: "internal",
      });
    };
  }
  async prepare(run: Run) {
    const controller = new AbortController();
    this.controllers.set(run.id, controller);
    try {
      if (!run.request.selectedStyleIds?.length) jevClient();
      run.phase = "preparing";
      run.error = undefined;
      run.errorCode = undefined;
      this.update(run);
      const workspace = path.join(dataRoot, "runs", run.id, "brief");
      await mkdir(path.join(workspace, "assets"), { recursive: true });
      const preparationInputs = (request: CreativeRequest) => ({
        request,
        catalog: this.catalog.hash,
        motions: this.catalog.motions,
        textModels,
        combinationModels,
        agentMode,
        ...(request.assetIds.length ? { attachmentReviewRevision: 1 } : {}),
      });
      const preparedRequest = preparationRequest(run);
      initializePreparation(run, preparationInputs(preparedRequest), [
        preparationInputs(run.request),
      ]);
      const checkpoint = <T>(
        step: PreparationStep,
        schema: z.ZodType<T>,
        task: () => Promise<T>,
        validate?: (output: T) => Promise<void>,
      ) =>
        preparationCheckpoint({
          run,
          step,
          schema,
          task,
          validate,
          signal: controller.signal,
          save: () => this.update(run),
        });
      const validateReferences = async (screenshots: ReferenceScreenshot[]) => {
        for (const screenshot of screenshots)
          await access(path.join(dataRoot, "runs", run.id, "references", screenshot.name));
      };
      const restoreReferences = async (screenshots: ReferenceScreenshot[]) => {
        await validateReferences(screenshots);
        const allowed = new Set(screenshots.map((item) => item.name));
        for (const name of await readdir(path.join(workspace, "assets"))) {
          if (/^website-reference-[a-f0-9-]+\.png$/.test(name) && !allowed.has(name))
            await rm(path.join(workspace, "assets", name));
        }
        for (const screenshot of screenshots)
          await copyFile(
            path.join(dataRoot, "runs", run.id, "references", screenshot.name),
            path.join(workspace, "assets", screenshot.name),
          );
        await writeFile(path.join(workspace, referenceManifest), JSON.stringify(screenshots));
        run.referenceScreenshots = structuredClone(screenshots);
      };
      await checkpoint(
        "inputs",
        z.object({ descriptions: z.array(z.string()) }),
        async () => {
          const descriptions: string[] = [];
          for (const id of preparedRequest.assetIds) {
            const a = this.store.getAsset(id);
            if (!a) throw Error("Uploaded asset not found");
            await copyFile(a.path, path.join(workspace, "assets", a.name));
            descriptions.push(await describeAsset(a));
          }
          run.referenceScreenshots ??= [];
          await writeFile(
            path.join(workspace, referenceManifest),
            JSON.stringify(run.referenceScreenshots),
          );
          for (const url of run.request.urls) {
            await validateReferenceUrl(url);
            descriptions.push(
              `${url}: Website reference. Use reference_browser tools to inspect and capture the existing product pages and sections that this brief needs. No screenshot has been assumed in advance.`,
            );
          }
          await writeFile(
            path.join(workspace, "input.json"),
            JSON.stringify({ request: preparedRequest, sourceDescriptions: descriptions }, null, 2),
          );
          return { descriptions };
        },
        async () => {
          await access(path.join(workspace, "input.json"));
          for (const id of preparedRequest.assetIds) {
            const asset = this.store.getAsset(id);
            if (!asset) throw Error("Uploaded asset not found");
            await access(path.join(workspace, "assets", asset.name));
          }
        },
      );
      const briefSchema = run.request.outputType === "page" ? PageBriefSchema : BriefSchema;
      const preparationBriefSchema =
        run.request.outputType === "page"
          ? PageBriefSchema.omit({ assetPlan: true })
          : BriefSchema.omit({ assetPlan: true });
      const brief = await checkpoint(
        "brief",
        z.object({
          assetReviewRevision: z.literal(2),
          value: briefSchema,
          sessionId: z.string().optional(),
          screenshots: z.array(ReferenceScreenshotSchema),
        }),
        async () => {
          await restoreReferences([]);
          const imageNames = preparedRequest.assetIds.flatMap((id) => {
            const asset = this.store.getAsset(id);
            return asset && briefAttachmentKind(asset) === "image" ? [asset.name] : [];
          });
          const images = await prepareBriefImages(workspace, imageNames, controller.signal);
          const attachments = preparedRequest.assetIds.map((id) => {
            const asset = this.store.getAsset(id);
            if (!asset) throw Error("Uploaded asset not found");
            return asset;
          });
          await prepareBriefAttachments(workspace, attachments, images, controller.signal);
          let prepared = await this.agents.run(() =>
            agentTurn<Brief | PageBrief>({
              provider: run.request.provider,
              model: textModels[run.request.provider],
              workspace,
              signal: controller.signal,
              readOnly: true,
              referenceUrls: run.request.urls,
              schema: preparationBriefSchema,
              exploreBriefSections: true,
              onEvent: this.providerEvent(run),
              prompt:
                (run.request.outputType === "page"
                  ? "Prepare a responsive interactive page brief. The previewBeat is one representative section with a meaningful user interaction; no video timing. List sections and interactionGoals. Do not include video duration. "
                  : "") +
                `${assetRequirementsPolicy.guidance}\n${briefExplorationInstructions}\n${briefAttachmentInstructions}\n${briefAssetAlignmentPrinciple}\nDuring preparation identify the core idea and main scenes first, then align extracted attachment content and proposed usage with those scenes. Repair unsuitable captures before returning where tools permit. The independent self-review will verify this handoff.\nRead input.json and brief-images.json. For uploaded images, inspect the listed inspectionPath first; if text or detail is unclear, inspect the unchanged originalPath at full resolution. Pica copies are only for brief inspection, never production assets. When URLs are provided, complete the REQUIRED WEBSITE REFERENCE EXPLORATION procedure before returning this brief: build the requested-view checklist, inspect supplied pages, navigate relevant existing projects/results for missing views, and capture those views. Report the navigation attempted for any item still unavailable. Captured website-reference screenshots in assets/ are available product images, not missing uploads. Respect instructions to omit unavailable optional steps, rather than adding placeholder scenes or unrequested asset requirements. Inspect them and use only the page states actually shown. A URL screenshot does not prove unseen pages or interactions. Produce a truthful structured content brief. Return subject as a short idea title of 4–10 words, capturing the core idea rather than repeating the prompt, scene list, requirements or settings. This title becomes the project heading after preparation completes. Identify one representative preview beat shared across styles. Keep previewBeat and any proposed scenes style-neutral: describe the narrative action, change and intended meaning, not an invented palette, background, lighting, material, drawing technique, visual effect or camera treatment. For example, describe an overlooked insight becoming clear and shareable. Do not suggest styles anywhere in the brief. Preserve visual choices explicitly requested by the user or evidenced in supplied assets; do not turn your own visual suggestions into facts or constraints. Defer all other visual treatment to the subsequent style-selection stage. Do not invent facts or describe image content without inspecting it. Infer audience and objective only when omitted and list assumptions in constraints. For video only, suggest a full duration based on content and explain it. Auto full-video duration must be at least ${MIN_AUTO_VIDEO_DURATION} seconds, with distinct story scenes rather than a stretched preview. Previews remain 3 seconds. Respect explicit duration up to the ${MAX_VIDEO_DURATION}-second (5-minute) maximum. Auto duration must not exceed this maximum. For video requests, read the lyrics setting: supplied lyrics are exact creative copy, and write mode reserves time for on-screen lyrics that will be prepared separately; do not write the lyrics yourself. Off means no lyric captions. Lyrics alone never authorize generated vocals. A separate video request.speech setting is explicit voice authorization: narration is prepared by the application with local Kokoro before full-film implementation; uploaded mode uses the selected attached recording. Plan readable on-screen text and reserve space for spoken content when that setting is active. Do not claim singing support, synthesize speech during preparation, or ask for a voice upload merely because local narration was selected. Previews remain silent.`,
            }),
          );
          prepared = await reviewBriefAssets({
            brief: prepared.value,
            sessionId: prepared.sessionId,
            request: preparedRequest,
            workspace,
            signal: controller.signal,
            schedule: (task) => this.agents.run(task),
            onEvent: this.providerEvent(run, undefined, "Brief asset self-review"),
            revise: (draft, sessionId, feedback) =>
              this.agents.run(() =>
                agentTurn<Brief | PageBrief>({
                  provider: run.request.provider,
                  model: textModels[run.request.provider],
                  workspace,
                  signal: controller.signal,
                  sessionId,
                  readOnly: true,
                  referenceUrls: run.request.urls,
                  schema: preparationBriefSchema,
                  promptContext: { currentDraft: draft, focusedReview: JSON.parse(feedback) },
                  onEvent: this.providerEvent(run, undefined, "Brief asset alignment repair"),
                  prompt: `${briefAttachmentInstructions}\n${briefAssetAlignmentPrinciple}\n${briefAssetRepairScopeRule} Repair only the single assigned asset alignment issue in this brief. Continue the original preparation session. Inspect affected sources; use reference_browser tools to recapture the correct existing view when required. Preserve the core idea, exact copy and requested settings. Apply only this issue's expected fix and acceptance criterion. Keep every unaffected field, scene, asset, exact copy, requirement and setting unchanged; no unrelated cleanup, rewriting or extra fixes. Change only the targeted source extraction or scene usage and any strictly necessary references, and record any genuine remaining inspection limitation rather than inventing evidence. Return the repaired full brief; a separate review will recheck it.\nRead currentDraft and focusedReview from the required input JSON. The review contains exactly one issue, its expected fix and acceptance criteria.`,
                }),
              ),
          });
          run.referenceScreenshots = await readReferenceScreenshots(workspace);
          run.brief = prepared.value;
          if (run.request.outputType !== "page") {
            const videoBrief = BriefSchema.parse(run.brief);
            const duration = resolveVideoDuration(
              run.request.duration,
              videoBrief.suggestedDuration,
            );
            run.brief = {
              ...videoBrief,
              suggestedDuration: duration,
              durationReason:
                run.request.duration === "auto" && videoBrief.suggestedDuration < duration
                  ? `${videoBrief.durationReason} Auto duration has a ${MIN_AUTO_VIDEO_DURATION}-second minimum for a complete story.`
                  : videoBrief.durationReason,
            };
          }
          return {
            assetReviewRevision: 2 as const,
            value: run.brief!,
            sessionId: prepared.sessionId,
            screenshots: run.referenceScreenshots || [],
          };
        },
        async (output) => validateReferences(output.screenshots),
      );
      run.brief = structuredClone(brief.value);
      this.recordAssetNeeds(run, [run.brief]);
      this.inputCheckpoint(run);
      await restoreReferences(brief.screenshots);
      if (run.request.outputType !== "page" && run.request.lyrics?.mode === "write") {
        const request = run.request;
        run.generatedLyrics = await checkpoint("lyrics", GeneratedLyricsSchema, async () => {
          this.emit(run, "lyrics", "Writing your lyrics…");
          const lyrics = await this.agents.run(() =>
            prepareLyrics({
              request,
              brief: BriefSchema.parse(run.brief),
              workspace,
              signal: controller.signal,
              onEvent: this.providerEvent(run, undefined, "Lyrics generation"),
            }),
          );
          if (!lyrics) throw Error("Lyrics could not be prepared.");
          return lyrics;
        });
        if (!run.generatedLyrics) throw Error("Lyrics could not be prepared.");
        if (!run.brief.exactCopy.includes(run.generatedLyrics.text))
          run.brief.exactCopy.push(run.generatedLyrics.text);
        this.update(run);
        this.emit(run, "lyrics", "Lyrics ready");
      }
      if (run.request.selectedStyleIds?.length) {
        const candidate = manualDirection(run.request, this.catalog.styles);
        run.candidates = [candidate];
        run.winnerId = candidate.id;
        run.rankingModel = undefined;
        const job = this.newJob(
          run,
          candidate,
          "full",
          run.request.outputType === "page"
            ? 3
            : resolveVideoDuration(
                run.request.duration,
                BriefSchema.parse(run.brief).suggestedDuration,
              ),
        );
        run.jobs.push(job);
        run.phase = "generating";
        this.update(run);
        await this.generate(run, job);
        run.phase = job.phase;
        this.update(run);
        return;
      }
      run.phase = "ranking";
      this.update(run);
      const summaries = await checkpoint(
        "styles",
        z.union([
          z.array(StyleSummarySchema).length(this.catalog.styles.length),
          z
            .object({ summaries: z.array(StyleSummarySchema).length(this.catalog.styles.length) })
            .transform((checkpoint) => checkpoint.summaries),
        ]),
        () => {
          this.emit(run, "input", "Preparing style information for your project…");
          return prepareStyleSummaries(
            this.catalog,
            run.request.provider,
            controller.signal,
            this.providerEvent(run, undefined, "Style information extraction"),
          );
        },
      );
      if (
        run.request.pinnedStyleId &&
        !this.catalog.styles.some((style) => style.id === run.request.pinnedStyleId)
      )
        throw Error("Pinned style was not found");
      await writeFile(
        path.join(workspace, "style-summaries.json"),
        JSON.stringify(summaries, null, 2),
      );
      const styleRange =
        run.request.outputType === "page"
          ? { min: 1, max: 3 }
          : videoStyleCountRange(
              resolveVideoDuration(
                run.request.duration,
                BriefSchema.parse(run.brief).suggestedDuration,
              ),
            );
      const proposalSchema = proposalSchemaForStyleRange(styleRange);
      await writeFile(
        path.join(workspace, "style-combinations.json"),
        JSON.stringify(
          this.catalog.styles.map((style) => ({
            styleId: style.id,
            suggested_combinations: style.suggested_combinations,
          })),
          null,
          2,
        ),
      );
      const proposals = await checkpoint(
        "proposals",
        z.object({
          policyRevision: z.literal(combinationProposalPolicyRevision),
          value: proposalSchema,
          screenshots: z.array(ReferenceScreenshotSchema),
        }),
        async () => {
          await restoreReferences(brief.screenshots);
          this.emit(run, "ranking", "Exploring visual directions for your project…");
          const proposed = await this.agents.run(() =>
            agentTurn({
              provider: run.request.provider,
              model: combinationModels[run.request.provider],
              workspace,
              signal: controller.signal,
              readOnly: true,
              referenceUrls: run.request.urls,
              schema: proposalSchema,
              promptContext: {
                brief: run.brief,
                previousDirections: run.candidates,
                regenerationRound: run.directionRound || 0,
              },
              onEvent: this.providerEvent(run, undefined, "Style combination proposals"),
              prompt: `${assetRequirementsPolicy.guidance}\nOutput type: ${run.request.outputType || "video"}. For pages, evaluate responsive layout and working user interactions rather than video timing. Read all ${summaries.length} cached style summaries in style-summaries.json before proposing directions. There is no individual-style shortlist: consider every style both as a primary identity and as a useful supporting contribution. Propose ${Math.max(12, run.request.candidateCount * 4)} distinct candidate options for the brief in the required input JSON. These are proposals for JEV to evaluate, not the final selected directions. Offer meaningfully different visual approaches, not cosmetic variations of one idea. Each direction must contain ${styleRange.min}–${styleRange.max} total distinct styles, counting the primary plus supporting styles. ${run.request.outputType === "page" ? "" : "This range comes from the full video duration, not the 3-second preview. Style count is separate from the requested number of preview directions."} Include single styles when permitted and compatible combinations with specific scene roles and honest asset feasibility. Read style-combinations.json for the full recommendations and their roles, rationale, consistency rules and pitfalls; compressed summaries are not the complete suggestion list. ${suggestedCombinationGuidance} ${candidateCopyGuidance} Keep one primary identity and add supporting styles within the permitted count only when they contribute meaningfully. Do not force the maximum; vary combination sizes where appropriate. Preserve the primary palette and visual identity, assign subordinate roles, and explain shared typography and motion rhythm. IDs must come from style-summaries.json. A primary style may appear in multiple genuinely distinct combinations. ${run.request.pinnedStyleId ? `Every primary style must be ${run.request.pinnedStyleId}.` : ""} Only when the model and available tools cannot fulfil a requested requirement, including inaccessible supplied URLs, return a focused assetNeeds question with its capability or access cause. Missing uploads alone do not warrant questions. Propose an honest adapted direction using available material; do not invent references. Use supplied images where appropriate and available code-generated visuals where none are supplied. Do not list multiple copies of the same combination, including reordered supporting styles.`,
            }),
          );
          run.referenceScreenshots = await readReferenceScreenshots(workspace);

          const allowed = new Set(this.catalog.styles.map((s) => s.id));
          const signatures = new Set<string>();
          const options = proposed.value.options.filter((o) => {
            const ids = [o.primaryStyleId, ...o.supportingStyleIds];
            const signature = [o.primaryStyleId, ...[...o.supportingStyleIds].sort()].join("|");
            if (
              ids.length < styleRange.min ||
              ids.length > styleRange.max ||
              ids.some((id) => !allowed.has(id)) ||
              new Set(ids).size !== ids.length ||
              signatures.has(signature) ||
              (run.request.pinnedStyleId && o.primaryStyleId !== run.request.pinnedStyleId)
            )
              return false;
            signatures.add(signature);
            return true;
          });

          return {
            policyRevision: combinationProposalPolicyRevision,
            value: { options },
            screenshots: run.referenceScreenshots || [],
          };
        },
        async (output) => validateReferences(output.screenshots),
      );
      await restoreReferences(proposals.screenshots);
      const options = proposals.value.options;
      const candidateSchema = proposalSchema.shape.options.element.extend({
        id: z.string(),
        score: z.number(),
        confidence: z.number(),
        dimensions: z.record(z.string(), z.number()),
      });
      const ranked = await checkpoint(
        "selection",
        z.object({ model: z.string(), candidates: z.array(candidateSchema).min(1) }),
        async () => {
          const selected = await rankOptions(
            run.brief!,
            options,
            this.catalog.styles,
            run.request,
            controller.signal,
            summaries,
            this.providerEvent(run, undefined, "Combination evaluation"),
            relevantPreferenceHistory(this.store.allRuns(), {
              id: run.id,
              brief: run.brief!,
              request: run.request,
            }),
          );
          if (!selected.candidates.length)
            throw Error(
              "No feasible style option passed the brief constraints. Supply the missing assets or clarify the request.",
            );
          return selected;
        },
      );
      run.rankingModel = ranked.model;
      const selectedCandidates = ranked.candidates.map((candidate) => ({
        ...candidate,
        id: directionCandidateId(run.directionRound || 0, candidate.id),
      }));
      run.candidates = [
        ...run.candidates.filter(
          (candidate) => !selectedCandidates.some((selected) => selected.id === candidate.id),
        ),
        ...selectedCandidates,
      ];
      run.phase = "generating";
      this.update(run);
      controller.signal.throwIfAborted();
      for (const candidate of selectedCandidates) {
        if (run.jobs.some((job) => job.candidateId === candidate.id && job.phase === "ready"))
          continue;
        const job = this.newJob(run, candidate, "preview", 3);
        run.jobs.push(job);
        this.recordAssetNeeds(run, [candidate], job.id);
      }
      this.update(run);
      await Promise.all(
        run.jobs
          .filter((job) => job.kind === "preview" && job.phase === "queued")
          .map((job) => this.generate(run, job)),
      );
      if (run.winnerId || run.inputWaits?.length) return;
      controller.signal.throwIfAborted();
      if (run.jobs.some((j) => j.phase === "ready")) run.phase = "ready";
      else run.phase = "failed";
      this.update(run);
    } catch (error) {
      if (error instanceof InputRequired) return;
      run.phase = controller.signal.aborted ? "cancelled" : "failed";
      run.error = safeMessage(error);
      run.errorCode = errorCode(error, "PREPARATION_FAILED");
      this.emit(run, "error", run.error);
      this.update(run);
    } finally {
      this.controllers.delete(run.id);
      this.resumeInputs(run);
    }
  }
  private newJob(
    run: Run,
    candidate: StyleCandidate,
    kind: "preview" | "full",
    duration: number,
  ): GenerationJob {
    const id = randomUUID();
    return {
      id,
      runId: run.id,
      candidateId: candidate.id,
      kind,
      ...(run.request.outputType === "page"
        ? { outputType: "page" as const }
        : { outputType: "video" as const, duration }),
      model: run.request.mainModel || models[run.request.provider],
      phase: "queued",
      createdAt: new Date().toISOString(),
      workspace: path.join(dataRoot, "runs", run.id, id),
    };
  }
  private async setup(run: Run, job: GenerationJob) {
    await mkdir(path.join(job.workspace, "assets"), { recursive: true });
    await mkdir(path.join(job.workspace, "vendor"), { recursive: true });
    await symlink(
      path.join(appRoot, "node_modules"),
      path.join(job.workspace, "node_modules"),
      "dir",
    ).catch((e) => {
      if (e.code !== "EEXIST") throw e;
    });
    const scopedAssetIds = assetIdsForQuestionScope(
      run.request.assetIds,
      scopedAssetQuestions(run),
      assetQuestionBuildScope(job, run.jobs),
    );
    for (const id of scopedAssetIds) {
      const a = this.store.getAsset(id)!;
      await copyFile(a.path, path.join(job.workspace, "assets", a.name));
    }
    for (const screenshot of run.referenceScreenshots || []) {
      await copyFile(
        path.join(dataRoot, "runs", run.id, "references", screenshot.name),
        path.join(job.workspace, "assets", screenshot.name),
      );
    }
    await copyFile(
      path.join(appRoot, "node_modules/gsap/dist/gsap.min.js"),
      path.join(job.workspace, "vendor/gsap.min.js"),
    );
    await copyFile(
      path.join(appRoot, "node_modules/three/build/three.module.js"),
      path.join(job.workspace, "vendor/three.module.js"),
    );
    await copyFile(
      path.join(appRoot, "node_modules/three/build/three.core.js"),
      path.join(job.workspace, "vendor/three.core.js"),
    );
    await copyFile(
      path.join(appRoot, "node_modules/pica/dist/pica.min.js"),
      path.join(job.workspace, "vendor/pica.min.js"),
    );
    await writeFile(
      path.join(job.workspace, "package.json"),
      JSON.stringify({
        name: run.request.outputType === "page" ? "interactive-page" : "video-composition",
        private: true,
        type: "module",
        dependencies: Object.fromEntries(
          await Promise.all(
            [
              "hyperframes",
              "gsap",
              "three",
              "chroma-js",
              "pica",
              "pixi.js",
              "roughjs",
              "paper",
              "motion",
              "react",
              "react-dom",
              "remotion",
              "@remotion/cli",
            ].map(async (name) => [
              name,
              JSON.parse(
                await readFile(path.join(appRoot, "node_modules", name, "package.json"), "utf8"),
              ).version,
            ]),
          ),
        ),
      }),
    );
    await writeFile(
      path.join(job.workspace, "style-context.json"),
      JSON.stringify(
        {
          brief: run.brief,
          assetInputs: scopedAssetIds.map((id) => {
            const asset = this.store.getAsset(id)!;
            return {
              id,
              path: `assets/${asset.name}`,
              name: asset.originalName || asset.name,
              kind: asset.kind,
            };
          }),
          candidate: run.candidates.find((c) => c.id === job.candidateId),
          production_policy:
            run.request.outputType === "page"
              ? "Responsive user-driven interactions; no video timeline or composition framework"
              : this.catalog.production_policy,
          styles: this.catalog.styles
            .filter((s) => {
              const c = run.candidates.find((c) => c.id === job.candidateId)!;
              return [c.primaryStyleId, ...c.supportingStyleIds].includes(s.id);
            })
            .map((style) => (run.request.outputType === "page" ? pageStyleContext(style) : style)),
          motions:
            run.request.outputType === "page"
              ? this.catalog.motions.map((m) => ({
                  id: m.id,
                  name: m.name,
                  description: m.description,
                  motion_sequence: m.motion_sequence,
                }))
              : this.catalog.motions,
        },
        null,
        2,
      ),
    );
  }
  async generate(run: Run, job: GenerationJob, feedback?: string, decisions?: string) {
    if (this.controllers.has(job.id)) return;
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    try {
      this.inputCheckpoint(run, job);
      feedback = [
        feedback || job.refinementPrompt,
        assetRequirementsPolicy.answerGuidance(
          scopedAssetQuestions(run),
          assetQuestionBuildScope(job, run.jobs),
        ),
      ]
        .filter(Boolean)
        .join("\n");
      await this.agents.run(async () => {
        controller.signal.throwIfAborted();
        if (job.phase === "cancelled") return;
        job.phase = "generating";
        job.startedAt = new Date().toISOString();
        job.finishedAt = undefined;
        this.update(run);
        await this.setup(run, job);
        if (job.outputType === "page") {
          if (run.request.outputType !== "page") throw Error("Page job requires a page request");
          await generatePage({
            job,
            request: run.request,
            brief: run.brief!,
            styles: this.catalog.styles,
            candidate: run.candidates.find((c) => c.id === job.candidateId)!,
            feedback,
            decisions,
            signal: controller.signal,
            update: () => {
              this.update(run);
              this.inputCheckpoint(run, job);
            },
            onEvent: this.providerEvent(run, job),
            emit: (type, msg) => this.emit(run, type, msg, job),
          });
          return;
        }
        if (run.request.outputType === "page") throw Error("Video job requires a video request");
        if (run.request.lyrics?.mode === "write" && !run.generatedLyrics) {
          this.emit(run, "lyrics", "Writing your lyrics…");
          run.generatedLyrics = await prepareLyrics({
            request: run.request,
            brief: BriefSchema.parse(run.brief),
            workspace: path.join(dataRoot, "runs", run.id, "brief"),
            signal: controller.signal,
            onEvent: this.providerEvent(run, undefined, "Lyrics generation"),
          });
          this.update(run);
          this.emit(run, "lyrics", "Lyrics ready");
        }
        await generateVideo({
          job,
          request: resolvedLyricsRequest(run.request, run.generatedLyrics),
          brief: BriefSchema.parse(run.brief),
          candidate: run.candidates.find((c) => c.id === job.candidateId)!,
          styles: this.catalog.styles,
          feedback,
          decisions,
          signal: controller.signal,
          update: () => {
            this.update(run);
            this.inputCheckpoint(run, job);
          },
          onEvent: this.providerEvent(run, job),
          emit: (type, msg) => this.emit(run, type, msg, job),
          render: (task) => this.renders.run(task),
        });
      });
      if (job.kind === "full" && job.outputType !== "page" && job.phase === "ready")
        this.queuePlaybackCopies(run, job.id);
    } catch (error) {
      if (error instanceof InputRequired) return;
      job.phase = controller.signal.aborted ? "cancelled" : "failed";
      job.error = safeMessage(error);
      job.errorCode = errorCode(
        error,
        job.outputType === "page" ? "PAGE_GENERATION_FAILED" : "VIDEO_GENERATION_FAILED",
      );
      job.finishedAt = new Date().toISOString();
      this.update(run);
      this.emit(run, "error", job.error, job);
    } finally {
      this.controllers.delete(job.id);
      this.resumeInputs(run);
    }
  }
  cancel(run: Run, jobId?: string) {
    run.inputWaits = jobId ? run.inputWaits?.filter((wait) => wait.jobId !== jobId) : [];
    if (jobId) {
      const job = run.jobs.find((j) => j.id === jobId);
      if (!job) throw Error("Job not found");
      if (terminalPhases.has(job.phase)) return;
      this.controllers.get(jobId)?.abort();
      job.phase = "cancelled";
      if (!this.controllers.has(jobId)) this.settleRun(run, job);
    } else {
      this.controllers.get(run.id)?.abort();
      for (const j of run.jobs) {
        if (!terminalPhases.has(j.phase)) {
          this.controllers.get(j.id)?.abort();
          j.phase = "cancelled";
        }
      }
      run.phase = "cancelled";
    }
    this.update(run);
  }
  async full(run: Run, candidateId: string, feedback?: string) {
    if (this.controllers.has(run.id))
      throw new CodedError("PROJECT_ACTIVE", "Wait for direction preparation to finish", 409);
    const preview = run.jobs.find(
      (j) => j.candidateId === candidateId && j.kind === "preview" && j.phase === "ready",
    );
    if (!preview || !run.brief) throw Error("Select a completed preview first");
    const existing = run.jobs.find(
      (j) =>
        j.kind === "full" &&
        j.candidateId === candidateId &&
        !["failed", "cancelled", "interrupted"].includes(j.phase),
    );
    if (existing) {
      run.winnerId = candidateId;
      run.phase = existing.phase;
      this.update(run);
      return existing;
    }
    for (const j of run.jobs)
      if (j.kind === "preview" && j.candidateId !== candidateId && !terminalPhases.has(j.phase))
        this.cancel(run, j.id);
    run.winnerId = candidateId;
    const candidate = run.candidates.find((c) => c.id === candidateId)!;
    const job = this.newJob(
      run,
      candidate,
      "full",
      run.request.outputType === "page"
        ? 3
        : resolveVideoDuration(
            run.request.duration,
            BriefSchema.parse(run.brief).suggestedDuration,
          ),
    );
    await mkdir(job.workspace, { recursive: true });
    await cp(preview.workspace, job.workspace, {
      recursive: true,
      filter: (source) => !["node_modules", "renders"].includes(path.basename(source)),
    });
    job.sessionId = preview.sessionId;
    run.jobs.push(job);
    run.phase = "generating";
    this.update(run);
    void this.generate(run, job, feedback).then(() => {
      run.phase = job.phase;
      this.update(run);
    });
    return job;
  }
  async refineVideo(run: Run, jobId: string, prompt: string) {
    if (
      this.hasActiveTasks(run) ||
      !terminalPhases.has(run.phase) ||
      run.jobs.some((job) => !terminalPhases.has(job.phase))
    )
      throw new CodedError("PROJECT_ACTIVE", "Wait for the current work to finish", 409);
    const source = run.jobs.find(
      (job) => job.id === jobId && job.kind === "full" && job.phase === "ready",
    );
    if (
      !source ||
      source.outputType === "page" ||
      run.request.outputType === "page" ||
      !source.sessionId ||
      !run.brief
    )
      throw new CodedError("INVALID_REQUEST", "Choose a completed video with a saved session");
    const feedback = prompt.trim();
    if (!feedback || feedback.length > 6000)
      throw new CodedError("INVALID_REQUEST", "Describe your changes in up to 6000 characters");
    const candidate = run.candidates.find((entry) => entry.id === source.candidateId);
    if (!candidate) throw new CodedError("INVALID_REQUEST", "Video direction not found");
    const job = this.newJob(run, candidate, "full", source.duration);
    job.model = source.model;
    job.sessionId = source.sessionId;
    job.sourceJobId = source.id;
    job.refinementPrompt = feedback;
    // Reserve the job before copying, so concurrent requests cannot start another build.
    run.jobs.push(job);
    run.phase = "generating";
    run.winnerId = candidate.id;
    this.update(run);
    try {
      await mkdir(job.workspace, { recursive: true });
      await cp(source.workspace, job.workspace, {
        recursive: true,
        filter: (file) => !["node_modules", "renders"].includes(path.basename(file)),
      });
    } catch (error) {
      job.phase = "failed";
      job.error = safeMessage(error);
      job.errorCode = "VIDEO_GENERATION_FAILED";
      run.phase = "failed";
      this.update(run);
      throw error;
    }
    void this.generate(run, job, feedback).then(() => {
      run.phase = job.phase;
      this.update(run);
    });
    return job;
  }
  regenerateDirections(run: Run) {
    if (
      this.hasActiveTasks(run) ||
      !terminalPhases.has(run.phase) ||
      run.jobs.some((job) => !terminalPhases.has(job.phase))
    )
      throw new CodedError("PROJECT_ACTIVE", "Wait for the current work to finish", 409);
    if (run.request.candidateCount === 0 || run.request.selectedStyleIds?.length)
      throw new CodedError("INVALID_REQUEST", "Manual styles do not use generated directions");
    if (!run.brief) throw new CodedError("INVALID_REQUEST", "Prepare the brief first");
    const round = (run.directionRound || 0) + 1;
    const checkpoints = run.preparation?.checkpoints || {};
    run.directionRounds = [
      ...(run.directionRounds || []),
      {
        round,
        startedAt: new Date().toISOString(),
        afterEventId: this.store.lastEventId(run.id),
        replacedCheckpoints: Object.fromEntries(
          directionRoundSteps.flatMap((step) =>
            checkpoints[step] ? [[step, checkpoints[step]]] : [],
          ),
        ),
      },
    ];
    run.directionRound = round;
    for (const step of directionRoundSteps) delete run.preparation?.checkpoints[step];
    run.winnerId = undefined;
    run.phase = "queued";
    this.update(run);
    return this.prepare(run);
  }
  retry(run: Run, jobId?: string) {
    if (!jobId) {
      if (this.hasActiveTasks(run))
        throw Error("Preparation is still stopping; retry when it finishes.");
      if (!["failed", "interrupted", "cancelled"].includes(run.phase))
        throw Error("Run is already active");
      void this.prepare(run);
      return;
    }
    const job = run.jobs.find((j) => j.id === jobId);
    if (!job || !["failed", "interrupted", "cancelled"].includes(job.phase))
      throw Error("Job is not retryable");
    if (this.controllers.has(job.id))
      throw Error("Cancellation is still stopping this job; retry when it finishes.");
    job.phase = "queued";
    job.error = undefined;
    job.errorCode = undefined;
    run.phase = "generating";
    this.update(run);
    void this.generate(run, job).then(() => {
      if (run.phase === "cancelled" || this.hasActiveTasks(run)) return;
      run.phase = run.jobs.some((j) => j.phase === "ready") ? "ready" : job.phase;
      this.update(run);
    });
  }
  queuePlaybackCopies(run: Run, jobId: string) {
    const job = run.jobs.find((item) => item.id === jobId);
    if (
      !job ||
      job.outputType === "page" ||
      job.kind !== "full" ||
      job.phase !== "ready" ||
      !job.video
    )
      throw new CodedError("INVALID_REQUEST", "Choose a finished full film");
    if (this.playbackCopies.has(job.id)) return false;
    const entry = {
      controller: new AbortController(),
      discard: false,
      done: Promise.resolve(),
    };
    this.playbackCopies.set(job.id, entry);
    job.playbackCopies = {
      profile: playbackCopyProfile,
      status: "making",
      updatedAt: new Date().toISOString(),
    };
    this.update(run);
    entry.done = this.renders
      .run(() =>
        makePlaybackCopies(job, entry.controller.signal, (type, message) =>
          this.emit(run, type, message, job),
        ),
      )
      .then(
        (copies) => {
          if (!entry.discard) Object.assign(job, copies);
        },
        (error) => {
          if (!entry.discard)
            job.playbackCopies = {
              profile: playbackCopyProfile,
              status: "failed",
              error: safeMessage(error),
              updatedAt: new Date().toISOString(),
            };
        },
      )
      .then(() => {
        if (!entry.discard) this.update(run);
      })
      .finally(() => this.playbackCopies.delete(job.id));
    return true;
  }
  async stopPlaybackCopies(run: Run) {
    const entries = run.jobs.flatMap((job) => this.playbackCopies.get(job.id) || []);
    for (const entry of entries) {
      entry.discard = true;
      entry.controller.abort();
    }
    await Promise.all(entries.map((entry) => entry.done));
  }
  shutdown() {
    for (const c of this.controllers.values()) c.abort();
    for (const entry of this.playbackCopies.values()) {
      entry.discard = true;
      entry.controller.abort();
    }
  }
}
