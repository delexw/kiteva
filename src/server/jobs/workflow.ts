import { DependencyCleanupError } from "../runtime/process-tree";
import { addAbortListener } from "node:events";
import { writePreviewPlan, previewPlanArtifact } from "./preview-plan";
import {
  AutomaticPreviewPlanSchema,
  runAutomaticPreviewWorkflow,
  validateAutomaticPreviewPlan,
} from "./subworkflows/automatic-preview/workflow";
import { buildRouteOf } from "../../shared/build-route";
import { fileBackedPlanningPrompt } from "../agents/planning-prompt";
import { writeProjectRequest } from "../requests/project-request";
import { activityScope, activityEventData, bindActivityCallback } from "./activity-scope";
import { preparationStepLabel } from "../../shared/preparation";
import {
  ExplicitStylePreviewsSchema,
  runExplicitStylePreviewWorkflow,
} from "./subworkflows/explicit-style-preview/workflow";
import { selectAudioAuthoring } from "../jev/strategies/audio-authoring";
import { selectAuthoringResources } from "../jev/strategies/visual-authoring";
import { linkWorkspaceDirectory } from "../runtime/workspace-links";
import { relevantPreferenceHistory } from "../catalog/preference-history";
import { directionCandidateId, directionRoundSteps } from "../../shared/direction-rounds";
import { scopedAssetQuestions } from "../../shared/asset-question-scopes";
import { StyleSummarySchema } from "../../shared/agents/schemas/style-summary";
import { randomDirections, RandomDirectionsSchema } from "./random-directions";
import { directBuildContext } from "./direct-build-context";
import { manualDirection } from "./manual-direction";
import { validateAssetLimits } from "../../shared/asset-limits";
import { RequestSchema } from "../../shared/contracts";
import { AssetQuestionAnswerSchema } from "../../shared/agents/schemas/asset-needs";
import { acceptsBriefAttachment } from "../../shared/brief-sections";
import {
  assetQuestionBuildScope,
  assetIdsForQuestionScope,
  assetRequirementsPolicy,
  matchesAssetQuestion,
} from "../../shared/asset-requirements-policy";
import { PageBriefSchema } from "../../shared/agents/schemas/page";
import { BriefSchema } from "../../shared/agents/schemas/video";
import { proposalSchemaForStyleRange } from "../../shared/agents/schemas/proposals";
import { candidateCopyGuidance } from "../../shared/candidate-copy";
import { z } from "zod";
import {
  combinationProposalPolicyRevision,
  compactDirectionProposalGuidance,
  suggestedCombinationGuidance,
  requestedStyleScopeGuidance,
} from "../../shared/style-combinations";
import { access, readdir, rm } from "node:fs/promises";
import {
  initializePreparation,
  preparationCheckpoint,
  preparationRequest,
} from "./preparation-checkpoints";
import { GeneratedSubtitlesSchema } from "../../shared/domains/video";
import { CodedError, errorCode } from "../../shared/errors";
import { prepareSubtitles, resolvedSubtitlesRequest } from "../domains/video/prepare-subtitles";
import { resolveVideoDuration, videoStyleCountRange } from "../../shared/domains/video";
import { generateVideo } from "../domains/video/workflow";
import { prepareVideoRefinement } from "../domains/video/refinement";
import { videoRendererOf } from "../../shared/video-renderers";

import { generatePage } from "../domains/page/workflow";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile, readFile, copyFile, cp } from "node:fs/promises";
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
import {
  runTitleBriefWorkflow,
  TitleBriefCheckpointSchema,
} from "./subworkflows/title-brief/workflow";
import { runFullBriefWorkflow } from "./subworkflows/full-brief/workflow";
import { prepareStyleSummaries } from "../catalog/style-summaries";
import { rankOptions } from "../jev/strategies/style-combination.js";
import { jevClient } from "../jev/client";
import {
  readReferenceScreenshots,
  referenceManifest,
} from "../agents/capabilities/reference-browser/tools";
import { validateReferenceUrl } from "../requests/reference-url";
import { prepareBriefAttachments, briefAttachmentKind } from "../requests/brief-attachments";
import { prepareBriefImages } from "../requests/brief-images";
import { describeAsset } from "../requests/inputs.js";
import { WorkQueue } from "./queue.js";
import { makePlaybackCopies } from "../rendering/render";
import { playbackCopyProfile } from "../rendering/playback-copies";
import { InputRequired, blockingQuestions } from "../../shared/input-checkpoint";
type WorkflowTask = { controller: AbortController; finish: () => void };

export class Workflow {
  private agents = new WorkQueue(5);
  private renders = new WorkQueue(1);
  private controllers = new Map<string, AbortController>();
  private dependencyCleanupErrors = new Map<string, DependencyCleanupError>();
  private taskOwners = new Map<string, string>();
  private taskSettlements = new Map<string, Promise<void>>();
  private stopping = false;
  private playbackCopies = new Map<
    string,
    { controller: AbortController; discard: boolean; done: Promise<void> }
  >();
  private startTask(id: string, runId = id): WorkflowTask | undefined {
    if (this.stopping || this.controllers.has(id)) return;
    const controller = new AbortController();
    let settle!: () => void;
    this.taskSettlements.set(id, new Promise<void>((resolve) => (settle = resolve)));
    this.controllers.set(id, controller);
    this.taskOwners.set(id, runId);
    const parent = id !== runId ? this.controllers.get(runId)?.signal : undefined;
    const cancellation = parent && addAbortListener(parent, () => controller.abort(parent.reason));
    return {
      controller,
      finish: () => {
        cancellation?.[Symbol.dispose]();
        this.controllers.delete(id);
        this.taskOwners.delete(id);
        this.taskSettlements.delete(id);
        settle();
      },
    };
  }
  private trackDependencyFailure(run: Run, error: unknown) {
    if (error instanceof DependencyCleanupError) this.dependencyCleanupErrors.set(run.id, error);
  }
  hasActiveTasks(run: Run) {
    return [...this.taskOwners.values()].includes(run.id);
  }
  constructor(
    readonly store: Store,
    readonly catalog: Catalog,
  ) {}
  private emit(run: Run, type: string, message: string, job?: GenerationJob, data?: unknown) {
    this.store.emit(run.id, type, message, job?.id, activityEventData(data));
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
    if (!body.answer && !body.assetIds.length)
      throw new CodedError("INVALID_REQUEST", "Reply or explicitly choose the alternative", 400);
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
    question.answer = body.answer || "Use the newly supplied reference.";
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
    if (this.stopping || run.phase === "cancelled") return;
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
    if (
      this.stopping ||
      run.phase === "cancelled" ||
      run.inputWaits?.length ||
      this.hasActiveTasks(run)
    )
      return;
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
      if (run.assetQuestions?.some((question) => matchesAssetQuestion(question, need, jobId)))
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
        if (run.assetQuestions?.some((question) => matchesAssetQuestion(question, need, job.id)))
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
    return bindActivityCallback((e: ProviderEvent) => {
      const eventData = e.data as
        | {
            resultReview?: boolean;
            videoBuildPlanning?: boolean;
            videoLocalization?: boolean;
            captureChapter?: unknown;
            captureProgress?: unknown;
            correctionTier?: string;
            correctionFocus?: string;
            sessionId?: string;
          }
        | undefined;
      if (
        e.type === "session" &&
        job &&
        !eventData?.resultReview &&
        !eventData?.videoLocalization &&
        !eventData?.captureChapter &&
        eventData?.correctionTier !== "cheap"
      ) {
        job.sessionId = (e.data as { sessionId: string }).sessionId;
        this.store.save(run);
      }
      this.emit(run, e.type, e.message, job, {
        ...(e.data as object),
        purpose:
          eventData?.captureChapter || eventData?.captureProgress
            ? "Footage chapter capture"
            : eventData?.videoLocalization
              ? "Video copy translation"
              : eventData?.videoBuildPlanning
                ? job?.kind === "full"
                  ? "Full video planning"
                  : "Preview video planning"
                : eventData?.resultReview
                  ? "Result quality review"
                  : eventData?.correctionFocus
                    ? `${eventData.correctionFocus} correction`
                    : purpose,
        audience: "internal",
      });
    });
  }
  async prepare(run: Run) {
    const task = this.startTask(run.id);
    if (!task) return;
    return activityScope("Project preparation", () => this.prepareWork(run, task), {
      signal: task.controller.signal,
      completionState: () =>
        run.inputWaits?.some((wait) => !wait.jobId)
          ? "waiting"
          : run.phase === "failed"
            ? "failed"
            : run.phase === "cancelled" || run.phase === "interrupted"
              ? "stopped"
              : "complete",
      onScope: (scope) =>
        this.store.emit(run.id, "activity_scope", scope.label, undefined, { activityScope: scope }),
    });
  }
  private async prepareWork(run: Run, task: WorkflowTask) {
    const { controller } = task;
    try {
      await writeProjectRequest(path.join(dataRoot, "runs", run.id), run.request);
      if (buildRouteOf(run.request) === "automatic-previews" && run.request.preference !== "random")
        jevClient();
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
      await writeProjectRequest(workspace, preparedRequest);
      initializePreparation(run, preparationInputs(preparedRequest), [
        preparationInputs(run.request),
      ]);
      const checkpoint = <T>(
        step: PreparationStep,
        schema: z.ZodType<T>,
        task: () => Promise<T>,
        validate?: (output: T) => Promise<void>,
      ) =>
        activityScope(
          preparationStepLabel(step, run.request, run.preparation),
          () =>
            preparationCheckpoint({
              run,
              step,
              schema,
              task,
              validate,
              signal: controller.signal,
              save: () => this.update(run),
            }),
          { signal: controller.signal },
        );
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
      const inputs = await checkpoint(
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
      if (buildRouteOf(run.request) !== "automatic-previews") {
        const title = await checkpoint("brief", TitleBriefCheckpointSchema, () =>
          this.agents.run(
            () =>
              runTitleBriefWorkflow({
                request: preparedRequest,
                workspace,
                signal: controller.signal,
                onEvent: this.providerEvent(run, undefined, "Project title extraction"),
              }),
            controller.signal,
          ),
        );
        run.brief = directBuildContext(run.request, inputs.descriptions, title.value.subject);
        if (buildRouteOf(run.request) === "selected-previews") {
          const selection = await checkpoint(
            "selection",
            ExplicitStylePreviewsSchema.extend({ previewBeat: z.string().min(1) }),
            () =>
              this.agents.run(
                () =>
                  runExplicitStylePreviewWorkflow({
                    request: preparedRequest,
                    styles: this.catalog.styles,
                    workspace,
                    signal: controller.signal,
                    previousDirections: run.candidates,
                    onEvent: this.providerEvent(run, undefined, "Explicit-style preview planning"),
                  }),
                controller.signal,
              ),
          );
          run.brief.previewBeat = selection.previewBeat;
          run.rankingModel = undefined;
          const candidates = selection.candidates.map((candidate) => ({
            ...candidate,
            id: directionCandidateId(run.directionRound || 0, candidate.id),
          }));
          await this.generatePreviews(run, candidates, controller.signal);
          return;
        }
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
                run.request.scriptItems,
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
      const briefSchema = run.request.outputType === "page" ? PageBriefSchema : BriefSchema;
      const brief = await checkpoint(
        "brief",
        z.object({
          assetReviewRevision: z.literal(2),
          value: briefSchema,
          sessionId: z.string().optional(),
          screenshots: z.array(ReferenceScreenshotSchema),
        }),
        async () => {
          return runFullBriefWorkflow({
            request: preparedRequest,
            workspace,
            signal: controller.signal,
            sourceDescriptions: inputs.descriptions,
            getAsset: (id) => this.store.getAsset(id),
            restoreReferences,
            schedule: (task) => this.agents.run(task, controller.signal),
            onEvent: (purpose) => this.providerEvent(run, undefined, purpose),
          });
        },
        async (output) => validateReferences(output.screenshots),
      );
      run.brief = structuredClone(brief.value);
      this.recordAssetNeeds(run, [run.brief]);
      this.inputCheckpoint(run);
      await restoreReferences(brief.screenshots);
      if (
        run.request.outputType !== "page" &&
        run.request.scriptItems === undefined &&
        run.request.subtitles?.mode === "write"
      ) {
        const request = run.request;
        run.generatedSubtitles = await checkpoint(
          "subtitles",
          GeneratedSubtitlesSchema,
          async () => {
            this.emit(run, "subtitles", "Writing your subtitles…");
            const subtitles = await this.agents.run(
              () =>
                prepareSubtitles({
                  request,
                  brief: BriefSchema.parse(run.brief),
                  workspace,
                  signal: controller.signal,
                  onEvent: this.providerEvent(run, undefined, "Subtitles generation"),
                }),
              controller.signal,
            );
            if (!subtitles) throw Error("Subtitles could not be prepared.");
            return subtitles;
          },
        );
        if (!run.generatedSubtitles) throw Error("Subtitles could not be prepared.");
        if (!run.brief.exactCopy.includes(run.generatedSubtitles.text))
          run.brief.exactCopy.push(run.generatedSubtitles.text);
        this.update(run);
        this.emit(run, "subtitles", "Subtitles ready");
      }
      run.phase = "ranking";
      this.update(run);
      const styleRange =
        run.request.outputType === "page"
          ? { min: 1, max: 3 }
          : videoStyleCountRange(
              resolveVideoDuration(
                run.request.duration,
                BriefSchema.parse(run.brief).suggestedDuration,
                run.request.scriptItems,
              ),
            );
      let selectedCandidates: StyleCandidate[];
      if (run.request.preference === "random") {
        const selection = await checkpoint("selection", RandomDirectionsSchema, async () => {
          this.emit(run, "ranking", "Drawing random Motion Graphics from the full pool…");
          return randomDirections(this.catalog.styles, run.request.candidateCount, styleRange);
        });
        run.rankingModel = undefined;
        selectedCandidates = selection.candidates.map((candidate) => ({
          ...candidate,
          id: directionCandidateId(run.directionRound || 0, candidate.id),
        }));
      } else {
        const summaries = await checkpoint(
          "styles",
          z.union([
            z.array(StyleSummarySchema).length(this.catalog.styles.length),
            z
              .object({ summaries: z.array(StyleSummarySchema).length(this.catalog.styles.length) })
              .transform((checkpoint) => checkpoint.summaries),
          ]),
          () => {
            this.emit(run, "input", "Preparing Motion Graphic information for your project…");
            return prepareStyleSummaries(
              this.catalog,
              run.request.provider,
              controller.signal,
              this.providerEvent(run, undefined, "Motion Graphic information extraction"),
            );
          },
        );
        if (
          run.request.pinnedStyleId &&
          !this.catalog.styles.some((style) => style.id === run.request.pinnedStyleId)
        )
          throw Error("Pinned Motion Graphic was not found");
        await writeFile(
          path.join(workspace, "style-summaries.json"),
          JSON.stringify(summaries, null, 2),
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
            const proposed = await this.agents.run(
              async () =>
                agentTurn({
                  provider: run.request.provider,
                  model: combinationModels[run.request.provider],
                  workspace,
                  signal: controller.signal,
                  readOnly: true,
                  referenceUrls: run.request.urls,
                  schema: proposalSchema,
                  promptContext: {
                    originalIdea: run.request.instructions,
                    sectionInstructions: run.request.requirements,
                    brief: run.brief,
                    previousDirections: run.candidates,
                    regenerationRound: run.directionRound || 0,
                  },
                  onEvent: this.providerEvent(
                    run,
                    undefined,
                    "Motion Graphic combination proposals",
                  ),
                  prompt: await fileBackedPlanningPrompt(
                    workspace,
                    "DIRECTION_PLANNING.md",
                    `${assetRequirementsPolicy.guidance}\n${compactDirectionProposalGuidance}\nOutput type: ${run.request.outputType || "video"}. For pages, evaluate responsive layout and working user interactions rather than video timing. Read all ${summaries.length} cached Motion Graphic summaries in style-summaries.json before proposing directions. There is no individual Motion Graphic shortlist: consider every Motion Graphic both as a primary identity and as a useful supporting contribution. Propose ${Math.max(12, run.request.candidateCount * 4)} distinct candidate options for the brief in the required input JSON. These are proposals for JEV to evaluate, not the final selected directions. Offer meaningfully different visual approaches, not cosmetic variations of one idea. Each generated candidate combination must contain ${styleRange.min}–${styleRange.max} distinct Motion Graphics, counting its primary plus supporting Motion Graphics. ${requestedStyleScopeGuidance} ${run.request.outputType === "page" ? "" : "This range comes from the full video duration, not the 3-second preview. Motion Graphic count is separate from the requested number of preview directions."} Include single Motion Graphics when permitted and compatible combinations with specific scene roles and honest asset feasibility. The unchanged originalIdea and sectionInstructions are authoritative; the brief is supporting context and cannot remove explicit requirements. In each rationale write a concise, self-contained comparison in complete sentences with these labels: Creative result; Contributions; Advantages; Disadvantages; Compatibility and adaptation. Explain the primary identity, what every support adds, why the whole combination suits this request, what it sacrifices compared with alternatives, conflicts in palette/material/typography/motion and how those conflicts would be reconciled without overriding visual restrictions. Explain when using the primary alone is better. Do not describe an option only by IDs, praise or a technology list; acknowledge unknowns rather than inventing evidence. Read style-combinations.json for the full recommendations and their roles, rationale, consistency rules and pitfalls; compressed summaries are not the complete suggestion list. ${suggestedCombinationGuidance} ${candidateCopyGuidance} Keep one primary identity and add supporting Motion Graphics within the permitted count only when they contribute meaningfully. Do not force the maximum; vary combination sizes where appropriate. Preserve the primary palette and visual identity, assign subordinate roles, and explain shared typography and motion rhythm. IDs must come from style-summaries.json. A primary Motion Graphic may appear in multiple genuinely distinct combinations. ${run.request.pinnedStyleId ? `Every primary Motion Graphic must be ${run.request.pinnedStyleId}.` : ""} Only when the model and available tools cannot fulfil a requested requirement, including inaccessible supplied URLs, return a focused assetNeeds question with its capability or access cause. Missing uploads alone do not warrant questions. Propose an honest adapted direction using available material; do not invent references. Use supplied images where appropriate and available code-generated visuals where none are supplied. Do not list multiple copies of the same combination, including reordered supporting Motion Graphics.`,
                  ),
                }),
              controller.signal,
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
          evaluationConfidence: z.number().optional(),
          selectionDecision: z
            .object({
              round: z.number(),
              comparedIds: z.array(z.string()),
              probabilities: z.record(z.string(), z.number()),
            })
            .optional(),
          dimensions: z.record(z.string(), z.number()),
        });
        const ranked = await checkpoint(
          "selection",
          z.object({
            policyRevision: z.literal(combinationProposalPolicyRevision),
            model: z.string(),
            candidates: z.array(candidateSchema).min(1),
          }),
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
                "No feasible Motion Graphic option passed the brief constraints. Supply the missing assets or clarify the request.",
              );
            return { ...selected, policyRevision: combinationProposalPolicyRevision } as const;
          },
        );
        run.rankingModel = ranked.model;
        selectedCandidates = ranked.candidates.map((candidate) => ({
          ...candidate,
          id: directionCandidateId(run.directionRound || 0, candidate.id),
        }));
      }
      if (run.request.outputType !== "page") {
        const plan = await checkpoint(
          "preview-plan",
          AutomaticPreviewPlanSchema,
          () =>
            this.agents.run(
              () =>
                runAutomaticPreviewWorkflow({
                  request: preparedRequest,
                  brief: run.brief!,
                  candidates: selectedCandidates,
                  workspace,
                  signal: controller.signal,
                  onEvent: this.providerEvent(run, undefined, "Shared preview planning"),
                }),
              controller.signal,
            ),
          async (output) => validateAutomaticPreviewPlan(output, selectedCandidates),
        );
        run.brief.previewBeat = plan.previewBeat;
        selectedCandidates = selectedCandidates.map((candidate) => ({
          ...candidate,
          ...plan.directions.find((direction) => direction.id === candidate.id)!,
        }));
      }
      await this.generatePreviews(run, selectedCandidates, controller.signal);
    } catch (error) {
      this.trackDependencyFailure(run, error);
      if (error instanceof InputRequired) return;
      run.phase = controller.signal.aborted ? "cancelled" : "failed";
      run.error = safeMessage(error);
      run.errorCode = errorCode(error, "PREPARATION_FAILED");
      this.emit(run, "error", run.error);
      this.update(run);
    } finally {
      task.finish();
      this.resumeInputs(run);
    }
  }
  private async generatePreviews(
    run: Run,
    selectedCandidates: StyleCandidate[],
    signal: AbortSignal,
  ) {
    run.candidates = [
      ...run.candidates.filter(
        (candidate) => !selectedCandidates.some((selected) => selected.id === candidate.id),
      ),
      ...selectedCandidates,
    ];
    await writePreviewPlan(path.join(dataRoot, "runs", run.id), run.brief!, selectedCandidates);
    run.phase = "generating";
    this.update(run);
    signal.throwIfAborted();
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
    signal.throwIfAborted();
    if (run.jobs.some((j) => j.phase === "ready")) run.phase = "ready";
    else run.phase = "failed";
    this.update(run);
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
  private async setup(run: Run, job: GenerationJob, signal: AbortSignal) {
    await mkdir(path.join(job.workspace, "assets"), { recursive: true });
    await mkdir(path.join(job.workspace, "vendor"), { recursive: true });
    await linkWorkspaceDirectory(
      path.join(appRoot, "node_modules"),
      path.join(job.workspace, "node_modules"),
    );
    const scopedAssetIds = assetIdsForQuestionScope(
      run.request.assetIds,
      scopedAssetQuestions(run),
      assetQuestionBuildScope(job, run.jobs),
    );
    for (const id of scopedAssetIds) {
      const a = this.store.getAsset(id)!;
      await copyFile(a.path, path.join(job.workspace, "assets", a.name));
    }
    if (run.request.selectedStyleIds?.length) {
      const assets = scopedAssetIds.map((id) => this.store.getAsset(id)!);
      const images = await prepareBriefImages(
        job.workspace,
        assets.filter((asset) => briefAttachmentKind(asset) === "image").map((asset) => asset.name),
        signal,
      );
      await prepareBriefAttachments(job.workspace, assets, images, signal);
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
    await writeProjectRequest(job.workspace, run.request);
    if (job.kind === "preview") {
      const planFile = path.resolve(job.workspace, previewPlanArtifact);
      try {
        await access(planFile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const candidate = run.candidates.find((entry) => entry.id === job.candidateId);
        if (!candidate) throw Error("Preview direction unavailable");
        await writePreviewPlan(job.workspace, run.brief!, [candidate]);
      }
    }
    await writeFile(
      path.join(job.workspace, "style-context.json"),
      JSON.stringify(
        {
          request: run.request,
          brief: run.brief,
          authoringResources: job.authoringResources,
          audioAuthoring: job.audioAuthoring,
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
          motionIds: this.catalog.motions.map((motion) => motion.id),
        },
        null,
        2,
      ),
    );
  }
  async generate(run: Run, job: GenerationJob, feedback?: string, decisions?: string) {
    if (run.phase === "cancelled" || job.phase === "cancelled") return;
    const task = this.startTask(job.id, run.id);
    if (!task) return;
    return activityScope(
      job.kind === "preview" ? "Creating your preview" : "Creating your full result",
      () => this.generateWork(run, job, task, feedback, decisions),
      {
        signal: task.controller.signal,
        completionState: () =>
          run.inputWaits?.some((wait) => wait.jobId === job.id)
            ? "waiting"
            : job.phase === "failed"
              ? "failed"
              : job.phase === "cancelled" || job.phase === "interrupted"
                ? "stopped"
                : "complete",
        onScope: (scope) =>
          this.store.emit(run.id, "activity_scope", scope.label, job.id, { activityScope: scope }),
      },
    );
  }
  private async generateWork(
    run: Run,
    job: GenerationJob,
    task: WorkflowTask,
    feedback?: string,
    decisions?: string,
  ) {
    const { controller } = task;
    try {
      this.update(run);
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
        if (!job.authoringResources && !job.production && !job.pageProduction) {
          job.authoringResources = await selectAuthoringResources({
            request: run.request,
            brief: run.brief!,
            candidate: run.candidates.find((candidate) => candidate.id === job.candidateId)!,
            styles: this.catalog.styles,
            signal: controller.signal,
            onEvent: this.providerEvent(run, job, "Authoring resource selection"),
          });
          this.update(run);
        }
        if (run.request.outputType !== "page" && !job.audioAuthoring) {
          job.audioAuthoring = await selectAudioAuthoring({
            request: run.request,
            workspace: job.workspace,
            preview: job.kind === "preview",
            signal: controller.signal,
            onEvent: this.providerEvent(run, job, "Audio authoring selection"),
          });
          this.update(run);
        }
        await this.setup(run, job, controller.signal);
        controller.signal.throwIfAborted();
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
          controller.signal.throwIfAborted();
          return;
        }
        if (run.request.outputType === "page") throw Error("Video job requires a video request");
        if (
          run.request.scriptItems === undefined &&
          run.request.subtitles?.mode === "write" &&
          !run.generatedSubtitles
        ) {
          this.emit(run, "subtitles", "Writing your subtitles…");
          run.generatedSubtitles = await prepareSubtitles({
            request: run.request,
            brief: BriefSchema.parse(run.brief),
            workspace: path.join(dataRoot, "runs", run.id, "brief"),
            signal: controller.signal,
            onEvent: this.providerEvent(run, undefined, "Subtitles generation"),
          });
          this.update(run);
          this.emit(run, "subtitles", "Subtitles ready");
        }
        await generateVideo({
          job,
          request: resolvedSubtitlesRequest(run.request, run.generatedSubtitles),
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
          render: (task) => this.renders.run(task, controller.signal),
        });
        controller.signal.throwIfAborted();
      }, controller.signal);
      if (job.kind === "full" && job.outputType !== "page" && job.phase === "ready")
        this.queuePlaybackCopies(run, job.id);
    } catch (error) {
      this.trackDependencyFailure(run, error);
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
      task.finish();
      this.resumeInputs(run);
    }
  }
  cancel(run: Run, jobId?: string) {
    for (const job of run.jobs) {
      if (jobId && job.id !== jobId) continue;
      const entry = this.playbackCopies.get(job.id);
      if (entry) {
        entry.discard = true;
        entry.controller.abort();
        if (job.outputType !== "page" && job.playbackCopies) {
          job.playbackCopies = {
            ...job.playbackCopies,
            status: "failed",
            error: "Cancelled",
            updatedAt: new Date().toISOString(),
          };
        }
      }
      this.controllers.get(job.id)?.abort();
    }
    if (!jobId)
      for (const [id, owner] of this.taskOwners) {
        if (owner === run.id) this.controllers.get(id)?.abort();
      }
    run.inputWaits = jobId ? run.inputWaits?.filter((wait) => wait.jobId !== jobId) : [];
    if (jobId) {
      const job = run.jobs.find((j) => j.id === jobId);
      if (!job) throw Error("Job not found");
      if (terminalPhases.has(job.phase)) {
        this.update(run);
        return;
      }
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
            run.request.scriptItems,
          ),
    );
    const task = this.startTask(run.id);
    if (!task) throw new CodedError("PROJECT_ACTIVE", "Project is stopping", 409);
    try {
      await mkdir(job.workspace, { recursive: true });
      await cp(preview.workspace, job.workspace, {
        recursive: true,
        filter: (source) => {
          task.controller.signal.throwIfAborted();
          return !["node_modules", "renders", ".runtime"].includes(path.basename(source));
        },
      });
      task.controller.signal.throwIfAborted();
      job.sessionId = preview.sessionId;
      run.jobs.push(job);
      run.phase = "generating";
      this.update(run);
      void this.generate(run, job, feedback).then(() => {
        run.phase = job.phase;
        this.update(run);
      });
      return job;
    } finally {
      task.finish();
    }
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
    if (job.outputType === "page") throw Error("Fine-tuning requires a video job");
    job.model = source.model;
    job.sessionId = source.sessionId;
    job.sourceJobId = source.id;
    job.refinementPrompt = feedback;
    // Reserve the job before copying, so concurrent requests cannot start another build.
    run.jobs.push(job);
    run.phase = "generating";
    run.winnerId = candidate.id;
    this.update(run);
    const task = this.startTask(run.id);
    if (!task) throw new CodedError("PROJECT_ACTIVE", "Project is stopping", 409);
    try {
      job.authoringResources = structuredClone(source.authoringResources);
      job.audioAuthoring = structuredClone(source.audioAuthoring);
      job.refinementCheckpoint = await prepareVideoRefinement(
        source,
        job,
        source.production?.pipeline ?? videoRendererOf(run.request),
        task.controller.signal,
      );
      task.controller.signal.throwIfAborted();
      this.update(run);
    } catch (error) {
      job.phase = task.controller.signal.aborted ? "cancelled" : "failed";
      job.error = safeMessage(error);
      job.errorCode = "VIDEO_GENERATION_FAILED";
      run.phase = job.phase;
      this.update(run);
      throw error;
    } finally {
      task.finish();
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
    if (run.request.candidateCount === 0)
      throw new CodedError("INVALID_REQUEST", "Direct builds do not use preview directions");
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
      // A project retry resumes its latest attempts; preparation is only needed
      // when it failed itself or has not produced a generation job yet.
      const retryableJobs = run.error
        ? []
        : run.jobs.filter(
            (job, index) =>
              ["failed", "interrupted", "cancelled"].includes(job.phase) &&
              run.candidates.some((candidate) => candidate.id === job.candidateId) &&
              !run.jobs
                .slice(index + 1)
                .some((later) => later.candidateId === job.candidateId && later.kind === job.kind),
          );
      if (retryableJobs.length) {
        for (const job of retryableJobs) this.retry(run, job.id);
        return;
      }
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
      this.stopping ||
      run.phase === "cancelled" ||
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
      .run(
        () =>
          makePlaybackCopies(job, entry.controller.signal, (type, message) =>
            this.emit(run, type, message, job),
          ),
        entry.controller.signal,
      )
      .then(
        (copies) => {
          if (!entry.discard) Object.assign(job, copies);
        },
        (error) => {
          this.trackDependencyFailure(run, error);
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
  async projectDependency<T>(
    run: Run,
    signal: AbortSignal,
    work: (signal: AbortSignal) => Promise<T>,
  ) {
    signal.throwIfAborted();
    if (run.phase === "cancelled") throw Error("Project was cancelled");
    const task = this.startTask(randomUUID(), run.id);
    if (!task) throw Error("Project is stopping");
    const cancellation = addAbortListener(signal, () => task.controller.abort(signal.reason));
    try {
      return await work(task.controller.signal);
    } catch (error) {
      this.trackDependencyFailure(run, error);
      throw error;
    } finally {
      cancellation[Symbol.dispose]();
      task.finish();
    }
  }
  async stop(run: Run, jobId?: string) {
    this.cancel(run, jobId);
    const ids = jobId
      ? [jobId]
      : [
          ...[...this.taskOwners].filter(([, owner]) => owner === run.id).map(([id]) => id),
          ...run.jobs.map((job) => job.id),
        ];
    await Promise.all(
      ids.flatMap((id) =>
        [this.taskSettlements.get(id), this.playbackCopies.get(id)?.done].filter(
          (task) => task !== undefined,
        ),
      ),
    );
    const cleanupError = this.dependencyCleanupErrors.get(run.id);
    if (cleanupError) throw cleanupError;
    if (
      run.errorCode === "DEPENDENCY_CLEANUP_FAILED" ||
      run.jobs.some(
        (job) => (!jobId || job.id === jobId) && job.errorCode === "DEPENDENCY_CLEANUP_FAILED",
      )
    )
      throw new DependencyCleanupError(run.error);
    this.cancel(run, jobId);
  }
  async stopPlaybackCopies(run: Run) {
    const entries = run.jobs.flatMap((job) => this.playbackCopies.get(job.id) || []);
    for (const entry of entries) {
      entry.discard = true;
      entry.controller.abort();
    }
    await Promise.all(entries.map((entry) => entry.done));
  }
  async shutdown() {
    this.stopping = true;
    for (const c of this.controllers.values()) c.abort();
    for (const entry of this.playbackCopies.values()) {
      entry.discard = true;
      entry.controller.abort();
    }
    await Promise.all([
      ...this.taskSettlements.values(),
      ...[...this.playbackCopies.values()].map((entry) => entry.done),
    ]);
  }
}
