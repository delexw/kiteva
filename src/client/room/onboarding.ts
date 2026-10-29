import { normalizeRetiredSpeechSelections } from "../../shared/speech-compatibility";
import { applyLanguageTracks } from "../../shared/language-tracks";
import { normalizeSubtitleFields } from "../../shared/subtitle-compatibility";
import { ScriptItemDraftSchema } from "../../shared/script-items";
import type { z } from "zod";
import {
  deliverySpeech,
  editSharedVideoScript,
  sharedVideoScript,
} from "../../shared/video-language";
import { speechConfigurationProblem } from "../../shared/speech";
import { RequestSchema, type CreativeRequest, type Run } from "../../shared/contracts";
import { projectEditBrief } from "../../shared/project-edit-brief";
import { SharedRequestSchema } from "../../shared/domains/common";
import type { PageRequest } from "../../shared/domains/page";
import type { VideoRequest } from "../../shared/domains/video";
import { assetLimitKind, assetLimits, validateAssetLimits } from "../../shared/asset-limits";
import {
  BriefRequirementsSchema,
  acceptsBriefAttachment,
  briefSectionFileAccept,
  type BriefRequirements,
} from "../../shared/brief-sections";
import { normalizeStyleSelection, trimStylesForDuration } from "../../shared/style-selection";
import { RoomDraftSchema, type RoomDraft, type RoomLibraryAsset } from "../../shared/room";

export const roomQuestions = [
  {
    label: "Idea",
    question:
      "What’s your idea? Tell me who it’s for and what you want them to feel or understand.",
  },
  {
    label: "Documents",
    question: "Any notes or documents I should read? Pick them from your shelf, or skip.",
  },
  {
    label: "Images",
    question:
      "Any images to bring into the story? Pick them from your shelf, or describe the look.",
  },
  {
    label: "URLs",
    question: "Any websites to look at? Add up to five links, one per line, or skip.",
  },
  {
    label: "Music",
    question: "What should the music sound like? Describe the score or choose reference audio.",
  },
  {
    label: "Narration / subtitles",
    question: "Would you like a narrator, a vocal recording, or words on screen?",
  },
  {
    label: "Settings",
    question: "How should I make it? Everything here is optional.",
  },
  {
    label: "Review",
    question: "Here’s your brief. Nothing starts until you press create.",
  },
] as const;
export const roomMaterialSteps = { 1: "main", 2: "images", 4: "music" } as const;
export type RoomMaterialSection = (typeof roomMaterialSteps)[keyof typeof roomMaterialSteps];
export const roomMaterialIntake = {
  main: {
    step: "Documents",
    upload: "Upload documents",
    limit: "documents",
    accept: briefSectionFileAccept.main,
  },
  images: {
    step: "Images",
    upload: "Upload images",
    limit: "images",
    accept: briefSectionFileAccept.images,
  },
  music: {
    step: "Music",
    upload: "Upload audio",
    limit: "audio",
    accept: briefSectionFileAccept.music,
  },
} as const satisfies Record<
  RoomMaterialSection,
  {
    step: (typeof roomQuestions)[number]["label"];
    upload: string;
    limit: Exclude<keyof typeof assetLimits, "total">;
    accept: string;
  }
>;

export function initialRoomRequest(): CreativeRequest {
  return RequestSchema.parse({
    instructions: "Your new idea",
    outputType: "video",
    resolution: "1080p",
    frameRate: 30,
    subtitles: { mode: "off" },
    outputLanguage: "en",
  });
}
export function emptyRoomDraft(): RoomDraft {
  return {
    step: 0,
    stepLayout: "separate-speech",
    request: { instructions: "", outputLanguage: "en", scriptItems: [] },
    assets: [],
  };
}

/** Keep older drafts on Settings or Review after inserting the speech step. */
export function roomDraftStep(draft: RoomDraft): number {
  return RoomDraftSchema.parse(draft).step;
}

export function removeRoomEditDraft(drafts: Record<string, RoomDraft>, key: string) {
  if (!key.startsWith("edit:") || !Object.hasOwn(drafts, key)) return drafts;
  const remaining = { ...drafts };
  delete remaining[key];
  return remaining;
}
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
/**
 * Read a saved, possibly partial or older draft. Fields still being typed (a short idea,
 * half-written links) are kept as typed; anything unusable falls back to its default.
 */
export function roomDraftRequest(draft: Partial<RoomDraft>): CreativeRequest {
  const saved = normalizeRetiredSpeechSelections(
    normalizeSubtitleFields(
      draft.request && typeof draft.request === "object" ? draft.request : {},
    ),
  ) as Record<string, unknown>;
  const merged = { ...initialRoomRequest(), ...saved };
  const count =
    typeof merged.candidateCount === "number" && merged.candidateCount > 0
      ? Math.min(5, Math.round(merged.candidateCount))
      : 5;
  const styles = strings(merged.selectedStyleIds);
  const requirements = BriefRequirementsSchema.safeParse(saved.requirements);
  const parsed = RequestSchema.safeParse({
    ...merged,
    scriptItems: undefined,
    outputLanguage: saved.outputLanguage,
    instructions: initialRoomRequest().instructions,
    urls: [],
    assetIds: [],
    requirements: undefined,
    candidateCount: styles.length && merged.candidateCount === 0 ? 0 : count,
  });
  const savedSubtitles = saved.subtitles;
  const draftSubtitlesText =
    savedSubtitles &&
    typeof savedSubtitles === "object" &&
    "text" in savedSubtitles &&
    typeof savedSubtitles.text === "string"
      ? savedSubtitles.text
      : undefined;
  const base = parsed.success
    ? parsed.data
    : switchRoomOutputType(initialRoomRequest(), saved.outputType === "page" ? "page" : "video");
  if (
    base.outputType === "video" &&
    base.subtitles?.mode === "provided" &&
    draftSubtitlesText !== undefined
  )
    base.subtitles = { mode: "provided", text: draftSubtitlesText };
  return {
    ...base,
    ...(base.outputType === "video" && Array.isArray(saved.scriptItems)
      ? { scriptItems: saved.scriptItems.map((item) => ScriptItemDraftSchema.parse(item)) }
      : {}),
    instructions: typeof saved.instructions === "string" ? saved.instructions : "",
    urls: strings(saved.urls),
    assetIds: strings(saved.assetIds),
    ...(requirements.success
      ? {
          requirements: {
            ...requirements.data,
            ...Object.fromEntries(
              (["main", "music", "images", "urls"] as const).map((section) => [
                section,
                {
                  ...requirements.data[section],
                  instructions:
                    (saved.requirements as BriefRequirements)[section].instructions ?? "",
                },
              ]),
            ),
          },
        }
      : {}),
    candidateCount: styles.length && merged.candidateCount === 0 ? 0 : count,
  };
}
const emptyRequirements = (): BriefRequirements => ({
  main: { instructions: "", assetIds: [] },
  images: { instructions: "", assetIds: [] },
  music: { instructions: "", assetIds: [] },
  urls: { instructions: "" },
});
export function roomMaterialSection(name: string): RoomMaterialSection | undefined {
  return Object.values(roomMaterialSteps).find((section) => acceptsBriefAttachment(section, name));
}
const megabytes = (bytes: number) => Math.round(bytes / 100_000) / 10;
export function roomStepMaterialCounts(
  section: RoomMaterialSection,
  assets: readonly RoomLibraryAsset[],
) {
  const kind = roomMaterialIntake[section].limit;
  const used = assets.filter((asset) => assetLimitKind(asset.originalName) === kind).length;
  const bytes = assets.reduce((total, asset) => total + asset.bytes, 0);
  return [
    {
      key: kind,
      label: `${roomMaterialIntake[section].step} ${used}/${assetLimits[kind].count}`,
      full: used >= assetLimits[kind].count,
    },
    {
      key: "total",
      label: `All materials ${assets.length}/${assetLimits.total.count} · ${megabytes(bytes)}/${megabytes(assetLimits.total.bytes)} MB`,
      full: assets.length >= assetLimits.total.count || bytes >= assetLimits.total.bytes,
    },
  ];
}
/**
 * Attach freshly uploaded shelf items to the current brief step. Items of another
 * kind, or past a limit, stay on the shelf and are reported instead of attached.
 */
export function attachRoomStepUploads(
  draft: RoomDraft,
  section: RoomMaterialSection,
  assets: readonly RoomLibraryAsset[],
) {
  let next = draft;
  const skipped: string[] = [];
  for (const asset of assets) {
    if (roomDraftRequest(next).assetIds.includes(asset.id)) continue;
    const belongs = roomMaterialSection(asset.originalName);
    if (belongs !== section) {
      skipped.push(
        belongs
          ? `${asset.originalName} is saved on your shelf — add it in the ${roomMaterialIntake[belongs].step} step`
          : `${asset.originalName} can’t be used in a brief`,
      );
      continue;
    }
    try {
      next = toggleRoomDraftAsset(next, asset);
    } catch (e) {
      skipped.push(
        `${asset.originalName} is saved on your shelf but not added: ${(e as Error).message}`,
      );
    }
  }
  return { draft: next, skipped };
}
/** Start (or keep) the new-idea draft with one chosen style; everything already typed stays. */
export function chooseRoomDraftStyle(draft: RoomDraft | undefined, styleId: string): RoomDraft {
  const current = draft || emptyRoomDraft();
  return { ...current, request: { ...current.request, selectedStyleIds: [styleId] } };
}
export function toggleRoomAsset(
  request: CreativeRequest,
  asset: RoomLibraryAsset,
  selected: RoomLibraryAsset[],
): CreativeRequest {
  const section = roomMaterialSection(asset.originalName);
  if (!section) throw Error(`${asset.originalName} can’t be used in a brief`);
  const removing = request.assetIds.includes(asset.id);
  const ids = removing
    ? request.assetIds.filter((id) => id !== asset.id)
    : [...request.assetIds, asset.id];
  if (!removing)
    validateAssetLimits(
      [...selected.filter((item) => item.id !== asset.id), asset].map((item) => ({
        ...item,
        name: item.originalName,
      })),
    );
  const requirements = structuredClone(request.requirements || emptyRequirements());
  requirements[section].assetIds = removing
    ? requirements[section].assetIds.filter((id) => id !== asset.id)
    : [...requirements[section].assetIds, asset.id];
  return { ...request, assetIds: ids, requirements };
}
export function toggleRoomDraftAsset(draft: RoomDraft, asset: RoomLibraryAsset): RoomDraft {
  const request = roomDraftRequest(draft);
  const selected = (draft.assets || []).filter((item) => request.assetIds.includes(item.id));
  const next = toggleRoomAsset(request, asset, selected);
  const assets = next.assetIds.includes(asset.id)
    ? [...selected.filter((item) => item.id !== asset.id), asset]
    : selected.filter((item) => item.id !== asset.id);
  return { ...draft, request: next, assets };
}
export function removeRoomDraftAsset(draft: RoomDraft, asset: RoomLibraryAsset): RoomDraft {
  return roomDraftRequest(draft).assetIds.includes(asset.id)
    ? toggleRoomDraftAsset(draft, asset)
    : draft;
}
function sharedRequest(request: CreativeRequest) {
  return Object.fromEntries(
    SharedRequestSchema.keyof().options.flatMap((key) =>
      request[key] === undefined ? [] : [[key, request[key]]],
    ),
  ) as z.infer<typeof SharedRequestSchema>;
}
export function switchRoomOutputType(
  request: CreativeRequest,
  outputType: CreativeRequest["outputType"],
): CreativeRequest {
  if (request.outputType === outputType) return request;
  const shared = sharedRequest(request);
  if (outputType === "page") {
    const page: PageRequest = {
      ...shared,
      outputType,
      viewport: "desktop",
      selectedStyleIds: trimStylesForDuration(shared.selectedStyleIds || [], "page", "auto"),
    };
    return page;
  }
  const video: VideoRequest = {
    ...shared,
    outputType,
    duration: "auto",
    aspectRatio: "16:9",
    resolution: "1080p",
    frameRate: 30,
    subtitles: { mode: "off" },
    selectedStyleIds: trimStylesForDuration(shared.selectedStyleIds || [], "video", "auto"),
  };
  return video;
}
export function roomDraftFromProject(
  request: CreativeRequest,
  assets: RoomLibraryAsset[],
): RoomDraft {
  return {
    step: 6,
    stepLayout: "separate-speech",
    request: { ...normalizeStyleSelection(request) },
    assets: assets.filter((asset) => request.assetIds.includes(asset.id)),
  };
}
export function roomEditDraft(
  run: Run,
  assets: RoomLibraryAsset[],
  previous?: RoomDraft,
): RoomDraft {
  const draft = previous || roomDraftFromProject(run.request, assets);
  const history = projectEditBrief(
    run,
    previous
      ? {
          instructions:
            typeof previous.request.instructions === "string"
              ? previous.request.instructions
              : run.request.instructions,
          historyIds: previous.editHistoryIds,
          historyText: previous.editHistoryText,
        }
      : undefined,
  );
  return {
    ...draft,
    request: { ...draft.request, instructions: history.instructions },
    editHistoryIds: history.historyIds,
    editHistoryText: history.historyText,
  };
}

export function roomSubmission(request: CreativeRequest): CreativeRequest {
  if (request.outputType === "video") request = applyLanguageTracks(request);
  if (request.outputType === "video" && request.scriptItems === undefined)
    request = editSharedVideoScript(request, sharedVideoScript(request));
  if (request.outputType === "video") {
    const problem = speechConfigurationProblem({ ...request, speech: deliverySpeech(request) });
    if (problem) throw Error(problem);
  }
  return RequestSchema.parse({
    ...normalizeStyleSelection(request),
    urls: request.urls.map((url) => url.trim()).filter(Boolean),
  });
}
