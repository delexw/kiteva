import { ScriptItems } from "./components/script-items";
import { legacyScriptItems, type ScriptItem } from "../shared/script-items";
import { creativeApproaches, type CreativeApproach } from "../shared/creative-approach";
import { UiLanguageProvider } from "./i18n";
import { uiLanguage, translateUi, useUiLanguage } from "./i18n";
import { VideoPlayer } from "./components/video-player";
import { CreativeRoom } from "./room/creative-room";
import {
  isRoomUtilityPage,
  roomLauncherUtilities,
  roomUtilities,
  type RoomUtilityPage,
} from "./room/utility-windows";
import { ProjectDownload } from "./components/project-download";
import { ProjectResultPending } from "./components/project-result-pending";
import { RoomProject } from "./room/room-project";
import { styleTechnologyRecommendations } from "../shared/style-technology";
import { replayPreviewVideos } from "./lib/replay-preview-videos";
import { ProjectStatus } from "./components/project-status";
import { StylePicker, CatalogPreviewProvider } from "./components/style-picker";
import { manualStyleLimit, trimStylesForDuration } from "../shared/style-selection";
import { validateAssetLimits } from "../shared/asset-limits";
import { PageTemplate } from "./components/page-template";
import { technologyPoolSize } from "../shared/technology-pool";
import { ProjectList } from "./components/project-list";
import { Button, Input, Alert, Card, Collapse } from "antd";
import { CodedError, errorCode } from "../shared/errors";
import { ProjectConversation } from "./components/project-conversation";
import { GenerationTime } from "./components/generation-time";
import { RunningProjects } from "./components/running-projects";
import { projectName } from "../shared/project-name";
import { api } from "./lib/api";
import { loadMotionCatalog } from "./motion-catalog";
import { appRoute } from "./lib/app-route";
import { projectSettingsDraft } from "./lib/project-settings";
import { SpeechSettings } from "./components/speech-settings";
import { ensureSpeechGenerationReady } from "./lib/speech";
import type { SpeechSettings as SpeechConfiguration } from "../shared/speech";
import { candidateDisplayTitle } from "../shared/candidate-copy";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { PreviewLoadingMedia } from "./components/preview-workspace";
import { lyricsFromInput, MAX_VIDEO_DURATION, playbackVideoOf } from "../shared/domains/video";
import { customerErrorMessage } from "./customer-messages";
import {
  PromptInput,
  PromptInputBody,
  PromptInputStyleMentions,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  type PromptInputMessage,
} from "./components/ai-elements/prompt-input";
import { ComposerAttachments } from "./components/composer-attachments";
import { BriefRequirements, type BriefAttachment } from "./components/brief-requirements";
import { acceptsBriefAttachment, type BriefSectionName } from "../shared/brief-sections";
const Textarea = Input.TextArea;
import "./framework.css";
import { StudioSelect, StudioSelectOption } from "./components/studio-select";
import { InteractivePagePreview } from "./domains/page/preview";
import React, { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import type { StickToBottomContext } from "use-stick-to-bottom";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import {
  Film,
  Grid2X2,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
  Play,
  LoaderCircle,
  Download,
  RotateCcw,
  Sparkles,
  Layers,
  SlidersHorizontal,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type {
  Style,
  Run,
  GenerationJob,
  StyleExample,
  AgentProgressEvent,
  CreativeRequest,
  Provider,
} from "../shared/contracts";
import { isRunSettled } from "../shared/contracts";
import { StyleCard, PaletteSwatches, StyleExampleMedia } from "./style-card";
import { Dialog } from "./dialog";
import { SuggestedCombinations } from "./style-combinations";
import { MotionExplorer } from "./motion-explorer";
import { MotionReferences } from "./motion-references";
import { MotionGraphicVariants } from "./catalog-variants";
import { RecommendedStack } from "./recommended-stack";
import "./style.css";
const GovernancePage = lazy(() =>
  import("./governance/page").then((module) => ({ default: module.GovernancePage })),
);
const TechnologyPoolPage = lazy(() =>
  import("./technology-pool-page").then((module) => ({ default: module.TechnologyPoolPage })),
);
const StoryboardPage = lazy(() =>
  import("./storyboard-page").then((module) => ({ default: module.StoryboardPage })),
);
const CreativeHero = lazy(() => import("./creative-hero"));
const SceneDemo = lazy(() => import("./scene-demo"));
type StyleSummary = Pick<Style, "id" | "name_en" | "category" | "visual_cues" | "palette"> & {
  renderer: string[];
  motion: string[];
};
type Setup = {
  agentMode: "local" | "hosted";
  models: Record<Provider, string>;
  jevConfigured: boolean;
  codexCredentialPresent: boolean;
  claudeCredentialPresent: boolean;
  modelValidation: string;
  styleCount: number;
  motionCount: number;
};
function artifactUrl(run: Run, job: GenerationJob, file: string) {
  return `/api/artifacts/${run.id}/${job.id}/${file}`;
}
function App() {
  useUiLanguage();
  const conversationContextRef = useRef<StickToBottomContext>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { page, projectId, styleId } = appRoute(location.pathname);
  const settingsSourceId =
    page === "create" && !projectId
      ? new URLSearchParams(location.search).get("settingsFrom")
      : null;
  const [restoredSettingsId, setRestoredSettingsId] = useState<string>();
  function setPage(next: string) {
    const paths: Record<string, string> = {
      create: run ? `/projects/${run.id}` : "/",
      history: "/projects",
      ...Object.fromEntries(roomLauncherUtilities.map((key) => [key, roomUtilities[key].path])),
    };
    navigate(paths[next] || "/");
  }
  const [playDemos, setPlayDemos] = useState(true);
  const [motionCount, setMotionCount] = useState(0);
  const [motionMentions, setMotionMentions] = useState<{ id: string; name_en: string }[]>([]);
  const [styles, setStyles] = useState<StyleSummary[]>([]);
  const [examples, setExamples] = useState<StyleExample[]>([]);

  const [setup, setSetup] = useState<Setup>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void loadMotionCatalog(controller.signal)
      .then((motions) =>
        setMotionMentions(motions.map((motion) => ({ id: motion.id, name_en: motion.name }))),
      )
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorCode(error));
      });
    return () => controller.abort();
  }, []);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Motion Graphics");
  const [detail, setDetail] = useState<Style>();
  useEffect(() => {
    const refresh = () =>
      void api<{ examples: StyleExample[] }>("/api/examples")
        .then((data) => setExamples(data.examples))
        .catch(() => {});
    refresh();
    if (page !== "styles" && !detail) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [page, detail?.id]);
  const [demo, setDemo] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [preference, setPreference] = useState<CreativeApproach>("context");
  const [provider, setProvider] = useState<Provider>("codex");
  const [count, setCount] = useState(5);
  const [outputType, setOutputType] = useState<"video" | "page">("video");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [duration, setDuration] = useState<number | "auto">("auto");
  const [resolution, setResolution] = useState<"1080p" | "1440p">("1080p");
  const [frameRate, setFrameRate] = useState<30 | 60>(30);
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [lyricsEnabled, setLyricsEnabled] = useState(false);
  const [lyricsText, setLyricsText] = useState("");
  const [scriptItems, setScriptItems] = useState<ScriptItem[]>();
  const [speech, setSpeech] = useState<SpeechConfiguration>();
  const [urls, setUrls] = useState("");
  const [sectionInstructions, setSectionInstructions] = useState({
    music: "",
    images: "",
    urls: "",
  });
  const [assets, setAssets] = useState<BriefAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const draftRevision = useRef(0);
  const [composerRevision, setComposerRevision] = useState(0);
  const [selectedStyleIds, setSelectedStyleIds] = useState<string[]>([]);
  const manual = selectedStyleIds.length > 0;
  const styleLimit = manualStyleLimit(outputType, duration);
  const [run, setRun] = useState<Run>();
  const projectNavigation = useRef(0);
  const [history, setHistory] = useState<Run[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Run>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [events, setEvents] = useState<AgentProgressEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (
      !run?.jobs.some((job) => !["ready", "failed", "cancelled", "interrupted"].includes(job.phase))
    )
      return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run]);
  const [feedback, setFeedback] = useState("");
  const jobVideoRefs = useRef(new Map<string, HTMLVideoElement>());
  useEffect(() => {
    void Promise.all([
      api<{ styles: StyleSummary[] }>("/api/styles"),
      api<Setup>("/api/setup"),
      api<Run[]>("/api/runs"),
    ])
      .then(([c, s, h]) => {
        setStyles(c.styles);
        setSetup(s);
        setMotionCount(s.motionCount);
        setHistory(h);
      })
      .catch((e) => setError(errorCode(e)));
  }, []);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const projects = await api<Run[]>("/api/runs");
        if (!disposed) setHistory(projects);
      } catch {
        // Keep the last successful snapshot during a temporary connection failure.
      }
    };
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!run?.id) return;
    setEvents([]);
    let disposed = false;
    const stream = new EventSource(`/api/runs/${run.id}/events`);
    const refreshRun = () =>
      void api<Run>(`/api/runs/${run.id}`)
        .then((next) => {
          if (!disposed) setRun(next);
        })
        .catch((e) => {
          if (!disposed) setError(errorCode(e));
        });
    let connected = false;
    stream.onopen = () => {
      if (connected) refreshRun();
      connected = true;
    };
    stream.onmessage = (event) => {
      const e = JSON.parse(event.data) as AgentProgressEvent;
      setEvents((old) => (old.some((x) => x.id === e.id) ? old : [...old, e]));
      if (["state", "preview_ready", "interrupted"].includes(e.type)) refreshRun();
    };
    return () => {
      disposed = true;
      stream.close();
    };
  }, [run?.id]);
  useEffect(() => {
    if (!run) return;
    setHistory((previous) =>
      previous.some((project) => project.id === run.id)
        ? previous.map((project) => (project.id === run.id ? run : project))
        : [run, ...previous],
    );
  }, [run]);
  function openProject(project: Run) {
    navigate(`/projects/${project.id}`);
  }
  useEffect(() => {
    const navigation = ++projectNavigation.current;
    setError("");
    setFeedback("");
    if (!projectId) {
      if (page === "create") {
        setRun(undefined);
        setEvents([]);
        if (settingsSourceId) {
          setRestoredSettingsId(undefined);
          void Promise.all([
            api<Run>(`/api/runs/${settingsSourceId}`),
            api<{ assets: Array<Omit<BriefAttachment, "section">> }>(
              `/api/runs/${settingsSourceId}/assets`,
            ),
            api<{ styles: StyleSummary[] }>("/api/styles"),
          ])
            .then(([project, attachments, _catalog]) => {
              if (navigation !== projectNavigation.current) return;
              const draft = projectSettingsDraft(project.request);
              setInstructions(draft.instructions);
              setPreference(draft.preference);
              setProvider(draft.provider);
              setCount(draft.count);
              setOutputType(draft.outputType);
              setViewport(draft.viewport);
              setDuration(draft.duration);
              setAspect(draft.aspect);
              setResolution(draft.resolution as "1080p" | "1440p");
              setFrameRate(draft.frameRate as 30 | 60);
              setLyricsEnabled(draft.lyricsEnabled);
              setLyricsText(draft.lyricsText);
              setSpeech(draft.speech);
              setScriptItems(draft.scriptItems);
              setUrls(draft.urls);
              setSectionInstructions(draft.sectionInstructions);
              setAssets(
                attachments.assets.map((asset) => ({
                  ...asset,
                  section: project.request.requirements?.music.assetIds.includes(asset.id)
                    ? "music"
                    : project.request.requirements?.images.assetIds.includes(asset.id)
                      ? "images"
                      : acceptsBriefAttachment("music", asset.originalName)
                        ? "music"
                        : acceptsBriefAttachment("images", asset.originalName)
                          ? "images"
                          : "main",
                })),
              );
              setSelectedStyleIds(draft.selectedStyleIds);
              setRestoredSettingsId(project.id);
            })
            .catch((error) => {
              if (navigation !== projectNavigation.current) return;
              setError(errorCode(error));
              navigate("/", { replace: true });
            });
        }
      }
      return;
    }
    setRun(undefined);
    void api<Run>(`/api/runs/${projectId}`)
      .then((latest) => {
        if (navigation !== projectNavigation.current) return;
        setRun(latest);
        setDuration(latest.request.outputType === "page" ? "auto" : latest.request.duration);
      })
      .catch((error) => {
        if (navigation !== projectNavigation.current) return;
        setError(errorCode(error));
        navigate("/projects", { replace: true });
      });
    return () => {
      projectNavigation.current++;
    };
  }, [projectId, page, settingsSourceId, navigate]);
  const styleDetailCache = useRef(new Map<string, Style>());
  useEffect(() => {
    setDemo(false);
    const cached = styleId ? styleDetailCache.current.get(styleId) : undefined;
    setDetail(cached);
    if (!styleId || cached) return;
    let disposed = false;
    void api<Style>(`/api/styles/${styleId}`)
      .then((style) => {
        if (!disposed) {
          styleDetailCache.current.set(styleId, style);
          setDetail(style);
          setDemo(false);
        }
      })
      .catch((error) => {
        if (!disposed) setError(errorCode(error));
      });
    return () => {
      disposed = true;
    };
  }, [styleId]);
  const categories = ["All Motion Graphics", ...new Set(styles.map((s) => s.category))];
  const filtered = styles.filter(
    (s) =>
      (category === "All Motion Graphics" || s.category === category) &&
      uiLanguage.matches(search, s.name_en, s.category, s.visual_cues),
  );
  async function deleteProject() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/api/runs/${deleteTarget.id}`, { method: "DELETE" });
      setHistory((projects) => projects.filter((project) => project.id !== deleteTarget.id));
      if (run?.id === deleteTarget.id) {
        setRun(undefined);
        setEvents([]);
        setFeedback("");
        navigate("/projects", { replace: true });
      }
      setDeleteTarget(undefined);
    } catch (error) {
      setDeleteError(errorCode(error));
    } finally {
      setDeleting(false);
    }
  }
  const openStyle = useCallback(
    (id: string) => {
      navigate(`/styles/${id}`);
    },
    [navigate],
  );
  async function upload(
    files: FileList | null,
    section: Exclude<BriefSectionName, "urls"> = "main",
  ) {
    if (!files) return;
    const revision = draftRevision.current;
    setUploading(true);
    try {
      if (Array.from(files).some((file) => !acceptsBriefAttachment(section, file.name)))
        throw new CodedError("FILE_TYPE_UNSUPPORTED", "Unsupported attachment for this section");
      validateAssetLimits([
        ...assets.map((asset) => ({ ...asset, name: asset.originalName, bytes: asset.bytes ?? 0 })),
        ...Array.from(files).map((file) => ({ name: file.name, bytes: file.size })),
      ]);
      const existingIds = assets.map((asset) => asset.id);
      for (const file of Array.from(files)) {
        if (revision !== draftRevision.current) return;
        const form = new FormData();
        form.append("assetIds", JSON.stringify(existingIds));
        form.append("file", file);
        const a = await api<Omit<BriefAttachment, "section">>("/api/assets", {
          method: "POST",
          body: form,
        });
        if (revision !== draftRevision.current) return;
        existingIds.push(a.id);
        setAssets((old) => [...old, { ...a, section }]);
      }
    } catch (e) {
      if (revision === draftRevision.current) setError(errorCode(e));
    } finally {
      if (revision === draftRevision.current) setUploading(false);
    }
  }
  function changeDuration(nextDuration: number | "auto") {
    setDuration(nextDuration);
    setSelectedStyleIds((ids) => trimStylesForDuration(ids, outputType, nextDuration));
  }
  async function start(message?: PromptInputMessage) {
    if (
      busy ||
      uploading ||
      selectedStyleIds.length > styleLimit ||
      instructions.trim().length < 8 ||
      (!manual && preference !== "random" && !setup?.jevConfigured)
    )
      return;
    const revision = draftRevision.current;
    setBusy(true);
    setError("");
    try {
      const submittedAssetIds = assets.map((asset) => asset.id);
      const mainAssetIds = assets
        .filter((asset) => asset.section === "main")
        .map((asset) => asset.id);
      for (const attachment of message?.files ?? []) {
        if (!acceptsBriefAttachment("main", attachment.filename || ""))
          throw new CodedError(
            "FILE_TYPE_UNSUPPORTED",
            "Main brief accepts Markdown, text and PDF only",
          );
        const response = await fetch(attachment.url);
        if (!response.ok)
          throw new CodedError("FILE_UNREADABLE", "Could not read an attached file");
        const form = new FormData();
        const blob = await response.blob();
        validateAssetLimits([
          ...assets.map((asset) => ({
            ...asset,
            name: asset.originalName,
            bytes: asset.bytes ?? 0,
          })),
          { name: attachment.filename || "reference", bytes: blob.size },
        ]);
        form.append("assetIds", JSON.stringify(submittedAssetIds));
        form.append("file", blob, attachment.filename || "reference");
        const asset = await api<Omit<BriefAttachment, "section">>("/api/assets", {
          method: "POST",
          body: form,
        });
        if (revision !== draftRevision.current) return;
        setAssets((previous) => [...previous, { ...asset, section: "main" }]);
        submittedAssetIds.push(asset.id);
        mainAssetIds.push(asset.id);
      }
      const request: CreativeRequest = {
        instructions,
        assetIds: submittedAssetIds,
        requirements: {
          main: { instructions: "", assetIds: mainAssetIds },
          music: {
            instructions: sectionInstructions.music,
            assetIds: assets.filter((asset) => asset.section === "music").map((asset) => asset.id),
          },
          images: {
            instructions: sectionInstructions.images,
            assetIds: assets.filter((asset) => asset.section === "images").map((asset) => asset.id),
          },
          urls: { instructions: sectionInstructions.urls },
        },
        urls: urls
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean),
        preference,
        provider,
        candidateCount: manual ? count : count || 5,
        selectedStyleIds,
        ...(outputType === "page"
          ? { outputType: "page" as const, viewport }
          : {
              outputType: "video" as const,
              duration,
              aspectRatio: aspect,
              resolution,
              frameRate,
              lyrics: lyricsFromInput(lyricsEnabled, lyricsText),
              speech,
              scriptItems,
            }),
      };
      if (request.outputType === "video") await ensureSpeechGenerationReady(request);
      const next = await api<Run>("/api/runs", { method: "POST", body: JSON.stringify(request) });
      if (revision !== draftRevision.current) return;
      setRun(next);
      navigate(`/projects/${next.id}`);
    } catch (e) {
      if (revision === draftRevision.current) setError(errorCode(e));
    } finally {
      if (revision === draftRevision.current) setBusy(false);
    }
  }
  async function action(type: "retry" | "cancel" | "directions", jobId?: string) {
    if (!run) return;
    try {
      setRun(
        await api<Run>(`/api/runs/${run.id}/${type}`, {
          method: "POST",
          body: JSON.stringify({ jobId }),
        }),
      );
    } catch (e) {
      setError(errorCode(e));
    }
  }
  async function full(candidateId: string, onStarted?: () => void) {
    if (!run) return;
    setBusy(true);
    try {
      await api(`/api/runs/${run.id}/full`, {
        method: "POST",
        body: JSON.stringify({
          candidateId,
          feedback,
        }),
      });
      onStarted?.();
      setRun(await api<Run>(`/api/runs/${run.id}`));
      void conversationContextRef.current?.scrollToBottom({ animation: "smooth", wait: true });
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
  }
  function newRequest(preserveDraft = false) {
    projectNavigation.current++;
    if (!preserveDraft) {
      draftRevision.current++;
      setComposerRevision((previous) => previous + 1);
      setInstructions("");
      setSectionInstructions({ music: "", images: "", urls: "" });
      setPreference("context");
      setProvider("codex");
      setCount(5);
      setOutputType("video");
      setViewport("desktop");
      setDuration("auto");
      setResolution("1080p");
      setFrameRate(30);
      setAspect("16:9");
      setUrls("");
      setAssets([]);
      setUploading(false);
      setBusy(false);
      setSelectedStyleIds([]);
      setFeedback("");
      setLyricsEnabled(false);
      setLyricsText("");
      setSpeech(undefined);
      setScriptItems(undefined);
      setError("");
      setRestoredSettingsId(undefined);
    }
    setRun(undefined);
    setEvents([]);
    navigate("/");
  }
  const fullBuildActive = run?.jobs.some(
    (job) =>
      job.kind === "full" && !["ready", "failed", "cancelled", "interrupted"].includes(job.phase),
  );
  function previewControls() {
    if (!run || fullBuildActive) return null;
    return (
      <>
        <div className="comparison-toolbar">
          {run.request.candidateCount > 0 && (
            <Button
              className="project-action-button project-regenerate-button"
              disabled={
                busy ||
                !["ready", "failed", "cancelled", "interrupted"].includes(run.phase) ||
                run.jobs.some(
                  (job) => !["ready", "failed", "cancelled", "interrupted"].includes(job.phase),
                )
              }
              onClick={() => void action("directions")}
            >
              <RotateCcw size={15} />
              {" " + translateUi("Regenerate") + " "}
              {run.request.candidateCount}
              {" " + translateUi("directions")}
            </Button>
          )}
          <p>
            {run.request.outputType === "page"
              ? translateUi("Same content. Try each page interaction.")
              : translateUi("Same story beat. Three seconds. Silent.")}
          </p>
          {run.request.outputType !== "page" && (
            <Button
              className="secondary"
              onClick={() => {
                replayPreviewVideos(run.jobs, jobVideoRefs.current);
              }}
            >
              <RotateCcw size={15} />
              {" " + translateUi("Replay all previews")}
            </Button>
          )}
        </div>
        <div className="comparison-controls">
          <label className="field-label">
            {translateUi("Feedback for the selected direction")}
            <Input
              placeholder={translateUi("Optional: slower motion, emphasize the main result…")}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
        </div>
      </>
    );
  }
  function fullDelivery(job: GenerationJob, activity?: React.ReactNode) {
    if (!run) return null;
    return (
      <div className="full-delivery">
        {candidateCard(job, activity)}
        <div className="delivery-links">
          <ProjectDownload runId={run.id} job={job} />
        </div>
        {job.phase === "ready" && (
          <div className="delivery-links">
            <a
              className="primary"
              href={
                job.outputType === "page"
                  ? `/api/projects/${run.id}/${job.id}`
                  : artifactUrl(run, job, job.video!)
              }
              download
            >
              <Download size={16} />{" "}
              {job.outputType === "page"
                ? translateUi("Download HTML bundle")
                : translateUi("Download MP4")}
            </a>
            <a
              className="secondary"
              href={
                job.outputType === "page"
                  ? artifactUrl(run, job, "PAGE_PLAN.md")
                  : `/projects/${run.id}/storyboard?job=${job.id}`
              }
              target="_blank"
              rel="noreferrer"
            >
              {job.outputType === "page" ? translateUi("Page plan") : translateUi("Storyboard")}
            </a>
          </div>
        )}
      </div>
    );
  }
  function candidateCard(
    job: GenerationJob,
    activity?: React.ReactNode,
    onFullStarted?: () => void,
  ) {
    const candidate = run!.candidates.find((c) => c.id === job.candidateId);
    const title = candidateDisplayTitle(
      candidate,
      candidate ? run!.candidates.indexOf(candidate) + 1 : undefined,
    );
    const fullVersionBuilt = run!.jobs.some(
      (existingJob) =>
        existingJob.kind === "full" &&
        existingJob.candidateId === job.candidateId &&
        existingJob.phase === "ready",
    );
    const active = !["ready", "failed", "cancelled", "interrupted"].includes(job.phase);
    return (
      <Card className="candidate studio-result-card" key={job.id}>
        <div
          className={`candidate-media ${!active && !job.video && !job.page ? "candidate-media-unavailable" : ""}`}
        >
          {job.outputType === "page" && job.page ? (
            <InteractivePagePreview
              job={job}
              title={title}
              viewport={run!.request.outputType === "page" ? run!.request.viewport : "desktop"}
            />
          ) : job.video ? (
            <VideoPlayer
              ref={(el) => {
                if (el) jobVideoRefs.current.set(job.id, el);
                else jobVideoRefs.current.delete(job.id);
              }}
              src={artifactUrl(run!, job, playbackVideoOf(job)!)}
              poster={job.poster ? artifactUrl(run!, job, job.poster) : undefined}
              aria-label={title}
              muted={job.kind === "preview"}
              loop={job.kind === "preview"}
              playsInline
              preload="metadata"
            />
          ) : active ? (
            <ProjectResultPending
              project={{
                ...run!,
                jobs: [job],
                inputWaits: run!.inputWaits?.filter((wait) => !wait.jobId || wait.jobId === job.id),
              }}
            />
          ) : (
            <PreviewLoadingMedia loading={false} status="Preview unavailable" />
          )}
        </div>
        <div className="candidate-body">
          <div className="candidate-heading">
            <h3>{title}</h3>
            {active && (
              <Button className="secondary compact" onClick={() => action("cancel", job.id)}>
                {translateUi("Cancel")}
              </Button>
            )}
          </div>
          <p>{job.outputType === "page" ? translateUi("Interactive page") : `${job.duration}s`}</p>
          {job.kind === "preview" && candidate?.displayDescription && (
            <p
              className="rationale candidate-description"
              aria-label={translateUi("Direction description")}
            >
              {candidate.displayDescription}
            </p>
          )}
          <GenerationTime job={job} now={clock} />
          {activity}
          {job.phase === "failed" && job.error && (
            <p className="failure">
              {customerErrorMessage(
                job.errorCode,
                job.outputType === "page" ? "PAGE_GENERATION_FAILED" : "VIDEO_GENERATION_FAILED",
              )}
            </p>
          )}
          {!active && (
            <div className="candidate-actions">
              {job.outputType === "page" && job.page && (
                <a
                  className="secondary compact"
                  href={`/api/pages/${run!.id}/${job.id}/index.html`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {translateUi("Open interactive page") + " "}
                  <ArrowUpRight size={14} />
                </a>
              )}
              {job.phase === "ready" && job.kind === "preview" && (
                <Button
                  type="primary"
                  className="primary compact"
                  disabled={busy || Boolean(fullBuildActive) || fullVersionBuilt || !candidate}
                  onClick={() => {
                    void full(job.candidateId, onFullStarted);
                  }}
                >
                  {fullVersionBuilt
                    ? run?.request.outputType === "page"
                      ? translateUi("Full page built")
                      : translateUi("Full video built")
                    : run?.request.outputType === "page"
                      ? translateUi("Choose & build full page")
                      : translateUi("Choose & build full video")}{" "}
                  <ArrowUpRight size={16} />
                </Button>
              )}
              {["failed", "cancelled", "interrupted"].includes(job.phase) && (
                <Button className="secondary compact" onClick={() => action("retry", job.id)}>
                  <RotateCcw size={14} />
                  {" " + translateUi("Retry")}
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
    );
  }
  function stylesExplorer() {
    return (
      <PageTemplate
        eyebrow="Library / Motion Graphic explore"
        title={translateUi("A Motion Graphic for every story.")}
        description={
          <p>
            {translateUi("Explore") + " "}
            {styles.length}
            {" " + translateUi("visual directions. Choose the medium, movement, and palette.")}
          </p>
        }
        controls={
          <div className="library-controls">
            <div className="search-field">
              <Search size={18} />
              <Input
                aria-label={translateUi("Search Motion Graphics")}
                placeholder={translateUi("Search Motion Graphics, materials, or visual cues…")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="category-select">
              <SlidersHorizontal size={16} />
              <StudioSelect
                aria-label={translateUi("Motion Graphic category")}
                value={category}
                onValueChange={(value) => setCategory(value)}
              >
                {categories.map((c) => (
                  <StudioSelectOption key={c} value={c}>
                    {translateUi(c)}
                  </StudioSelectOption>
                ))}
              </StudioSelect>
            </label>
            <Button
              htmlType="button"
              aria-pressed={playDemos}
              onClick={() => setPlayDemos((playing) => !playing)}
            >
              {playDemos ? translateUi("Pause demos") : translateUi("Play demos")}
            </Button>
            <span>
              {filtered.length}
              {" " + translateUi("results")}
            </span>
          </div>
        }
      >
        <div className="style-grid">
          {filtered.map((s) => (
            <StyleCard
              key={s.id}
              style={s}
              showId={false}
              showDescription={false}
              example={examples.find((example) => example.styleId === s.id)}
              playbackEnabled={playDemos && !detail}
              onSelect={openStyle}
            />
          ))}
        </div>
        {!filtered.length && (
          <p className="empty">{translateUi("No Motion Graphics match this search.")}</p>
        )}
      </PageTemplate>
    );
  }
  function styleDetailDialog(detail: Style, onUse: (style: Style) => void) {
    const technology = styleTechnologyRecommendations(detail.tech);
    return (
      <Dialog
        title={translateUi(detail.name_en)}
        onClose={() => {
          setDetail(undefined);
          navigate("/styles");
        }}
        wide
        footer={
          <Button type="primary" className="primary" onClick={() => onUse(detail)}>
            {translateUi("Use this Motion Graphic") + " "}
            <ArrowRight size={16} />
          </Button>
        }
      >
        <div className="style-detail">
          <div>
            <StyleExampleMedia
              styleId={detail.id}
              playOnOpen
              version={examples.find((e) => e.styleId === detail.id)?.generatedAt}
              video={examples.find((e) => e.styleId === detail.id)?.video}
              videoVersion={examples.find((e) => e.styleId === detail.id)?.videoGeneratedAt}
              motionStatus={examples.find((e) => e.styleId === detail.id)?.motionStatus}
            />
            <p className="example-disclaimer">
              {examples.find((e) => e.styleId === detail.id)?.authorship === "application"
                ? translateUi("Application-authored Motion Graphic study; not reference footage.")
                : examples.find((e) => e.styleId === detail.id)?.source
                  ? translateUi(
                      "Model-authored single-page Motion Graphic study; not reference footage.",
                    )
                  : translateUi("Illustrative sketch; a model-authored page is being prepared.")}
            </p>
            {examples.find((e) => e.styleId === detail.id)?.source && (
              <>
                <a
                  className="secondary"
                  href={`/api/examples/${detail.id}/page`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {translateUi("Open Motion Graphic study") + " "}
                  <ArrowUpRight size={16} />
                </a>
                <p className="example-disclaimer">
                  {examples.find((e) => e.styleId === detail.id)?.model}
                </p>
                <p>
                  {translateUi(examples.find((e) => e.styleId === detail.id)?.designNotes || "")}
                </p>
                {examples.find((e) => e.styleId === detail.id)?.motionDescription && (
                  <>
                    <h3>{translateUi("Why this motion fits the illustration")}</h3>
                    <p>
                      {translateUi(
                        examples.find((e) => e.styleId === detail.id)?.motionDescription || "",
                      )}
                    </p>
                    <p className="example-disclaimer">
                      {translateUi("Selected references:")}{" "}
                      {examples
                        .find((e) => e.styleId === detail.id)
                        ?.selectedMotionReferenceIds?.join(", ") ||
                        translateUi("None — illustration-specific motion")}
                    </p>
                  </>
                )}
              </>
            )}
            <h3>{translateUi("Color palette")}</h3>
            <PaletteSwatches
              tokens={detail.palette.tokens}
              backgroundPolicy={detail.palette.background_policy}
            />

            {/isometric|3d/i.test(detail.name_en) && (
              <>
                <Button className="secondary" onClick={() => setDemo(true)}>
                  {translateUi("Open interactive geometry study")}
                </Button>
                {demo && (
                  <Suspense fallback={<p>{translateUi("Loading demonstration…")}</p>}>
                    <SceneDemo tokens={detail.palette.tokens} />
                  </Suspense>
                )}
              </>
            )}
          </div>
          <div>
            <p className="eyebrow">{translateUi(detail.category)}</p>
            <h3>{translateUi("Visual direction")}</h3>
            <p>{translateUi(detail.visual_cues)}</p>
            <h3>{translateUi("Production responsibilities")}</h3>
            <p>
              <strong>{translateUi("Visuals:")}</strong>{" "}
              {technology.style_renderer.recommended_stack_refs
                .map((name) => translateUi(name))
                .join(", ") || translateUi("Select an appropriate Motion Graphic renderer")}
            </p>
            <p>
              <strong>{translateUi("Motion:")}</strong>{" "}
              {technology.motion_engine.recommended_stack_refs
                .map((name) => translateUi(name))
                .join(", ") || translateUi("Select an appropriate motion engine")}
            </p>
            <p>
              <strong>{translateUi("Export:")}</strong>
              {" " + translateUi("Uses the project’s renderer setting")}
            </p>
            <h3>{translateUi("Palette constraints")}</h3>
            <ul>
              {detail.palette.constraints.map((c) => (
                <li key={c}>{translateUi(c)}</li>
              ))}
            </ul>
            <h3>{translateUi("Audio direction")}</h3>
            <p>{translateUi(detail.audio_direction.prompt)}</p>
            <MotionGraphicVariants variants={detail.motion_graphic_variants} />
            <SuggestedCombinations
              style={detail}
              styles={styles}
              examples={examples}
              onSelect={openStyle}
            />
            <Collapse
              destroyOnHidden
              size="small"
              items={[
                {
                  key: "Recommended stack",
                  label: translateUi("Recommended stack"),
                  children: (
                    <>
                      <RecommendedStack
                        libraries={technology.recommended_stack}
                        implementation={technology.implementation}
                        selectionGuidance={technology.library_selection}
                      />
                    </>
                  ),
                },
              ]}
            />
            <Collapse
              destroyOnHidden
              size="small"
              items={[
                {
                  key: "Motion references",
                  label: translateUi("Motion references"),
                  children: (
                    <>
                      <MotionReferences references={detail.motion_references} />
                    </>
                  ),
                },
              ]}
            />
            <Collapse
              destroyOnHidden
              size="small"
              items={[
                {
                  key: "Executable prompt",
                  label: translateUi("Original executable prompt"),
                  children: (
                    <>
                      <pre>{detail.executable_prompt_template}</pre>
                    </>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </Dialog>
    );
  }
  function roomUtilityContent(
    utilityPage: RoomUtilityPage,
    chooseStyle: (id: string, name: string) => void,
  ) {
    return (
      <>
        {error && (
          <Alert
            type="error"
            showIcon
            title={customerErrorMessage(error)}
            closable={{ onClose: () => setError("") }}
          />
        )}
        {utilityPage === "storyboard" ? (
          projectId && (
            <Suspense fallback={<p role="status">{translateUi("Opening storyboard…")}</p>}>
              <StoryboardPage
                key={location.pathname + location.search}
                projectId={projectId}
                jobId={new URLSearchParams(location.search).get("job") || ""}
                onBack={() => navigate(`/projects/${projectId}`)}
              />
            </Suspense>
          )
        ) : utilityPage === "governance" ? (
          <Suspense fallback={<div role="status">{translateUi("Loading governance…")}</div>}>
            <GovernancePage />
          </Suspense>
        ) : utilityPage === "technologies" ? (
          <Suspense fallback={<div role="status">{translateUi("Loading technologies…")}</div>}>
            <TechnologyPoolPage />
          </Suspense>
        ) : utilityPage === "motions" ? (
          <MotionExplorer />
        ) : (
          <>
            {stylesExplorer()}
            {detail &&
              styleDetailDialog(detail, (style) => {
                setDetail(undefined);
                chooseStyle(style.id, style.name_en);
              })}
          </>
        )}
      </>
    );
  }
  if (page === "create" || page === "history" || isRoomUtilityPage(page))
    return React.createElement(
      CatalogPreviewProvider,
      { examples, motions: motionMentions },

      <MotionConfig reducedMotion="user">
        <CreativeRoom
          projects={history}
          active={projectId && page === "create" ? run : undefined}
          styles={styles}
          examples={examples}
          editSourceId={settingsSourceId}
          onOpen={(project) => void openProject(project)}
          onCreated={(project) => {
            setHistory((previous) => [
              project,
              ...previous.filter((item) => item.id !== project.id),
            ]);
            setRun(project);
            navigate(`/projects/${project.id}`);
          }}
          onDeleted={(id) => {
            setHistory((previous) => previous.filter((project) => project.id !== id));
            if (run?.id === id) {
              setRun(undefined);
              setEvents([]);
              navigate("/projects", { replace: true });
            }
          }}
          onHome={() => navigate("/projects")}
          onLaunch={setPage}
          onNavigate={(path) => navigate(path)}
          utility={
            isRoomUtilityPage(page)
              ? {
                  page,
                  path: location.pathname + location.search,
                  content: ({ chooseStyle }) => roomUtilityContent(page, chooseStyle),
                }
              : undefined
          }
          onUpdated={(project) => {
            if (project.id === run?.id) setRun(project);
            setHistory((previous) =>
              previous.map((item) => (item.id === project.id ? project : item)),
            );
          }}
          projectContent={(onQuestion, view, onView) =>
            run && (
              <RoomProject
                key={run.id}
                run={run}
                styles={styles}
                examples={examples}
                view={view}
                onView={onView}
                events={events}
                controls={previewControls()}
                renderPreview={(job) =>
                  candidateCard(job, undefined, () => onView({ ...view, tab: "full" }))
                }
                renderFull={fullDelivery}
                onQuestion={onQuestion}
                onUpdated={setRun}
                onEdit={() => navigate(`/?settingsFrom=${run.id}`)}
                onCancel={() => void action("cancel")}
                onRetry={(jobId) => action("retry", jobId)}
              />
            )
          }
        />
      </MotionConfig>,
    );
  return React.createElement(
    CatalogPreviewProvider,
    { examples, motions: motionMentions },

    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              newRequest();
            }}
          >
            <span className="brand-symbol">
              <img src="/kiteva-mark.svg" alt="" width={41} height={41} />
            </span>
            <span>
              {translateUi("kiteva")}
              <span className="brand-caption">{translateUi("IDEAS TAKE FLIGHT")}</span>
            </span>
          </a>
          <Button className="new-button" onClick={() => newRequest()}>
            <Plus size={16} />
            {" " + translateUi("New project")}
          </Button>
          <nav aria-label={translateUi("Main navigation")}>
            <section className="navigation-group" aria-labelledby="workspace-navigation-heading">
              <h2 id="workspace-navigation-heading">{translateUi("Workspace")}</h2>
              <Button
                type="text"
                className={page === "create" ? "selected" : ""}
                onClick={() => setPage("create")}
              >
                <Film size={17} />
                {" " + translateUi("Create workspace")}
              </Button>
              <Button
                type="text"
                className={page === "history" ? "selected" : ""}
                onClick={() => {
                  setPage("history");
                  void api<Run[]>("/api/runs").then(setHistory);
                }}
              >
                <Layers size={17} />
                {" " + translateUi("Recent projects")}
              </Button>
            </section>
            <section className="navigation-group" aria-labelledby="library-navigation-heading">
              <h2 id="library-navigation-heading">{translateUi("Library")}</h2>
              <Button
                type="text"
                className={page === "styles" ? "selected" : ""}
                onClick={() => setPage("styles")}
              >
                <Grid2X2 size={17} />
                {" " + translateUi("Motion Graphic explore") + " "}
                <span>{styles.length}</span>
              </Button>
              <Button
                type="text"
                className={page === "motions" ? "selected" : ""}
                onClick={() => setPage("motions")}
              >
                <Play size={17} />
                {" " + translateUi("Motion explorer") + " "}
                <span>{motionCount}</span>
              </Button>
              <Button
                type="text"
                className={page === "technologies" ? "selected" : ""}
                aria-label={translateUi("Technology pool")}
                onClick={() => setPage("technologies")}
              >
                <Wrench size={17} />
                {" " + translateUi("Technology pool") + " "}
                <span>{technologyPoolSize}</span>
              </Button>
            </section>
            <section className="navigation-group" aria-labelledby="admin-navigation-heading">
              <h2 id="admin-navigation-heading">{translateUi("Admin")}</h2>
              <Button
                type="text"
                className={page === "governance" ? "selected" : ""}
                onClick={() => setPage("governance")}
              >
                <ShieldCheck size={17} />
                {" " + translateUi("Governance")}
              </Button>
            </section>
          </nav>
          <div className="sidebar-bottom">
            <span className="local-dot" />
            {" " + translateUi("Local workspace")}
            <p>
              {translateUi("Your projects stay on this computer.")}
              <br />
              {translateUi("Selected context goes to AI providers.")}
            </p>
            <div className="stack-note">{translateUi("VISUALS → MOTION → EXPORT")}</div>
          </div>
        </aside>
        <main className={page === "create" && run ? "project-workspace" : undefined}>
          {page === "create" && !run && (
            <RunningProjects projects={history} onOpen={(project) => void openProject(project)} />
          )}
          {error && (
            <Alert
              type="error"
              showIcon
              title={customerErrorMessage(error)}
              closable={{ onClose: () => setError("") }}
            />
          )}
          {page === "storyboard" && projectId ? (
            <Suspense fallback={<p>{translateUi("Opening storyboard…")}</p>}>
              <StoryboardPage
                key={location.pathname + location.search}
                projectId={projectId}
                jobId={new URLSearchParams(location.search).get("job") || ""}
                onBack={() => navigate(`/projects/${projectId}`)}
              />
            </Suspense>
          ) : page === "governance" ? (
            <Suspense fallback={<div role="status">{translateUi("Loading governance…")}</div>}>
              <GovernancePage />
            </Suspense>
          ) : page === "technologies" ? (
            <Suspense fallback={<div role="status">{translateUi("Loading technologies…")}</div>}>
              <TechnologyPoolPage />
            </Suspense>
          ) : page === "motions" ? (
            <MotionExplorer />
          ) : page === "styles" ? (
            stylesExplorer()
          ) : page === "history" ? (
            <PageTemplate
              eyebrow="Workspace / Recent projects"
              title={translateUi("Recent projects.")}
              description={<p>{translateUi("Resume a project with its previews and history.")}</p>}
              controls={
                <RunningProjects
                  projects={history}
                  onOpen={(project) => void openProject(project)}
                />
              }
            >
              <ProjectList
                projects={history}
                styles={styles}
                examples={examples}
                onEdit={(project) => navigate(`/?settingsFrom=${project.id}`)}
                onOpen={(project) => void openProject(project)}
                onDelete={(project) => {
                  setDeleteError("");
                  setDeleteTarget(project);
                }}
              />
            </PageTemplate>
          ) : settingsSourceId && restoredSettingsId !== settingsSourceId ? (
            <p role="status">{translateUi("Loading your settings…")}</p>
          ) : projectId && run?.id !== projectId ? (
            <p role="status">{translateUi("Loading project…")}</p>
          ) : run ? (
            <PageTemplate
              className="project-page-template"
              eyebrow="Workspace / Project"
              title={run.brief?.subject || translateUi("Developing your idea…")}
              description={<ProjectStatus phase={run.phase} />}
              actions={
                <>
                  <Button
                    className="secondary project-action-button"
                    onClick={() => navigate(`/?settingsFrom=${run.id}`)}
                  >
                    <SlidersHorizontal size={16} />
                    {" " + translateUi("Back to settings")}
                  </Button>
                  {!isRunSettled(run) && (
                    <Button
                      type="primary"
                      danger
                      className="danger stop-run-button"
                      onClick={() => action("cancel")}
                    >
                      {translateUi("Stop run")}
                    </Button>
                  )}
                </>
              }
              controls={
                <RunningProjects
                  projects={history}
                  onOpen={(project) => void openProject(project)}
                />
              }
            >
              {run.error && (
                <div className="error-banner">
                  <div className="preparation-error-details">
                    {customerErrorMessage(run.errorCode, "PREPARATION_FAILED")}
                  </div>
                  <Button className="preparation-retry-button" onClick={() => action("retry")}>
                    {translateUi("Retry preparation")}
                  </Button>
                </div>
              )}
              <ProjectConversation
                examples={examples}
                styles={styles}
                onRunUpdated={setRun}
                contextRef={conversationContextRef}
                run={run}
                events={events}
                now={clock}
                titleFor={(job) => {
                  const candidate = run.candidates.find(
                    (candidate) => candidate.id === job.candidateId,
                  );
                  return candidateDisplayTitle(
                    candidate,
                    run.candidates.findIndex((c) => c.id === job.candidateId) + 1,
                  );
                }}
                controls={previewControls()}
                renderPreview={candidateCard}
                renderFull={fullDelivery}
                onCancel={(jobId) => void action("cancel", jobId)}
                onPreviewActivate={() => {
                  void conversationContextRef.current?.scrollToBottom({
                    animation: "smooth",
                    wait: true,
                  });
                }}
              />
            </PageTemplate>
          ) : (
            <>
              <div className="page-heading hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <Sparkles size={13} />
                    {" " + translateUi("A SMALL IDEA. MANY POSSIBILITIES.")}
                  </div>
                  <h1>
                    {translateUi("Give your idea")}
                    <br />
                    {translateUi("a moving form")}
                    <span>.</span>
                  </h1>
                  <p>
                    {translateUi("Find a visual direction.")}{" "}
                    {outputType === "page"
                      ? translateUi("Try a working interaction.")
                      : translateUi("Compare a few seconds.")}
                    <br />
                    {translateUi("Then make the whole story.")}
                  </p>
                </div>
                <Suspense fallback={<div className="hero-art" />}>
                  <CreativeHero />
                </Suspense>
              </div>
              <div className="create-layout">
                <Card className="composer studio-composer-card">
                  <div className="section-heading">
                    <h2>{translateUi("What are we making?")}</h2>
                    <span className="small-label">{translateUi("YOUR BRIEF")}</span>
                  </div>
                  <PromptInput
                    key={composerRevision}
                    className="idea-composer"
                    aria-label={translateUi("Create a project")}
                    onSubmit={start}
                    multiple
                    accept="text/markdown,text/plain,application/pdf"
                    onError={() => setError("FILE_TYPE_UNSUPPORTED")}
                  >
                    <PromptInputBody>
                      <BriefRequirements
                        instructions={sectionInstructions}
                        onChange={(section, value) =>
                          setSectionInstructions((previous) => ({
                            ...previous,
                            [section]: value,
                          }))
                        }
                        assets={assets}
                        onRemove={(id) =>
                          setAssets((previous) => previous.filter((asset) => asset.id !== id))
                        }
                        uploading={uploading}
                        onUpload={upload}
                        urls={urls}
                        onUrlsChange={setUrls}
                      >
                        <PromptInputStyleMentions
                          styles={styles}
                          name="message"
                          suffix={false}
                          aria-label={translateUi("Project instructions")}
                          className="brief-input"
                          placeholder={translateUi(
                            "Describe your idea, your audience, and what you want to make…",
                          )}
                          value={instructions}
                          onChange={setInstructions}
                        />
                        <ComposerAttachments />
                      </BriefRequirements>
                    </PromptInputBody>
                    <div className="composer-context">
                      <label className="field-label manual-style-picker">
                        {translateUi("Choose your own Motion Graphics · up to") + " "}
                        {styleLimit}
                        <StylePicker
                          styles={styles}
                          examples={examples}
                          selectedIds={selectedStyleIds}
                          limit={styleLimit}
                          onChange={(ids) => {
                            setSelectedStyleIds(ids);
                            if (ids.length && preference === "random") setPreference("context");
                            if (!ids.length && !count) setCount(5);
                          }}
                        />
                        <span>
                          {manual
                            ? translateUi(
                                "Preview your chosen Motion Graphics, or select zero directions to build directly. No style proposals or ranking.",
                              )
                            : duration === "auto"
                              ? translateUi(
                                  "Auto duration allows {{value0}} Motion Graphics. Set a duration to select more.",
                                  { value0: styleLimit },
                                )
                              : translateUi("Leave empty to generate directions.")}
                        </span>
                      </label>
                      {outputType === "video" &&
                        (scriptItems !== undefined ? (
                          <ScriptItems
                            items={scriptItems}
                            duration={duration}
                            onChange={setScriptItems}
                          />
                        ) : (
                          <Button
                            disabled={speech?.mode === "uploaded"}
                            onClick={() =>
                              setScriptItems(
                                legacyScriptItems({
                                  duration,
                                  speech,
                                  lyrics: {
                                    mode: lyricsEnabled ? "provided" : "off",
                                    text: lyricsText,
                                  },
                                }),
                              )
                            }
                          >
                            {translateUi("Use timed script items")}
                          </Button>
                        ))}
                      {outputType === "video" && scriptItems === undefined && lyricsEnabled && (
                        <label className="field-label composer-lyrics-input">
                          {translateUi("Your lyrics")}
                          <Textarea
                            aria-label={translateUi("Your lyrics")}
                            className="url-input"
                            placeholder={translateUi(
                              "Paste your lyrics, or leave blank to generate them…",
                            )}
                            maxLength={8000}
                            value={lyricsText}
                            onChange={(event) => setLyricsText(event.target.value)}
                          />
                          <span>
                            {translateUi(
                              "Leave blank to generate lyrics. Choose speech below to add a voice.",
                            )}
                          </span>
                        </label>
                      )}
                      {outputType === "video" && scriptItems === undefined && lyricsEnabled && (
                        <SpeechSettings
                          value={speech}
                          onChange={setSpeech}
                          audioAssets={assets
                            .filter((asset) => asset.section === "music")
                            .map((asset) => ({ id: asset.id, name: asset.originalName }))}
                        />
                      )}
                    </div>
                    <PromptInputFooter className="composer-toolbar">
                      <PromptInputTools className="composer-tools">
                        <div className="composer-control">
                          <StudioSelect
                            aria-label={translateUi("Output type")}
                            value={outputType}
                            onValueChange={(value) => setOutputType(value as "video" | "page")}
                          >
                            <StudioSelectOption value="video">
                              {translateUi("Video")}
                            </StudioSelectOption>
                            <StudioSelectOption value="page">
                              {translateUi("Interactive page")}
                            </StudioSelectOption>
                          </StudioSelect>
                        </div>
                        <div className="composer-control">
                          <StudioSelect
                            aria-label={translateUi("Model")}
                            value={provider}
                            onValueChange={(value) => setProvider(value as Provider)}
                          >
                            <StudioSelectOption value="codex">
                              {translateUi("GPT-6.1 Sol")}
                            </StudioSelectOption>
                            <StudioSelectOption value="claude">
                              {translateUi("Opus 5.5")}
                            </StudioSelectOption>
                          </StudioSelect>
                        </div>
                        <div className="composer-control">
                          <StudioSelect
                            aria-label={translateUi("Preview options")}
                            value={manual ? count : count || 5}
                            onValueChange={(value) => setCount(Number(value))}
                          >
                            {(manual ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5]).map((n) => (
                              <StudioSelectOption key={n} value={n}>
                                {n} {n === 1 ? translateUi("direction") : translateUi("directions")}
                              </StudioSelectOption>
                            ))}
                          </StudioSelect>
                        </div>
                        {outputType === "video" ? (
                          <>
                            {" "}
                            <div className="composer-control">
                              <StudioSelect
                                aria-label={translateUi("Full video duration")}
                                value={
                                  duration === "auto"
                                    ? "auto"
                                    : [15, 30, 60, 90].includes(duration)
                                      ? duration
                                      : "custom"
                                }
                                onValueChange={(value) =>
                                  changeDuration(
                                    value === "auto"
                                      ? "auto"
                                      : value === "custom"
                                        ? 45
                                        : Number(value),
                                  )
                                }
                              >
                                <StudioSelectOption value="auto">
                                  {translateUi("Auto · 15s minimum")}
                                </StudioSelectOption>
                                {[15, 30, 60, 90].map((n) => (
                                  <StudioSelectOption key={n} value={n}>
                                    {n}
                                    {" " + translateUi("seconds")}
                                  </StudioSelectOption>
                                ))}
                                <StudioSelectOption value="custom">
                                  {translateUi("Custom duration")}
                                </StudioSelectOption>
                              </StudioSelect>
                              {duration !== "auto" && (
                                <Input
                                  type="number"
                                  min={3}
                                  max={MAX_VIDEO_DURATION}
                                  aria-label={translateUi("Custom duration seconds")}
                                  title={translateUi("Maximum 5 minutes (300 seconds)")}
                                  value={duration}
                                  onChange={(e) =>
                                    changeDuration(
                                      Math.min(MAX_VIDEO_DURATION, Number(e.target.value)),
                                    )
                                  }
                                />
                              )}
                            </div>
                            <div className="composer-control">
                              <StudioSelect
                                aria-label={translateUi("Aspect ratio")}
                                value={aspect}
                                onValueChange={(value) => setAspect(value as typeof aspect)}
                              >
                                <StudioSelectOption value="16:9">16:9</StudioSelectOption>
                                <StudioSelectOption value="9:16">9:16</StudioSelectOption>
                                <StudioSelectOption value="1:1">1:1</StudioSelectOption>
                              </StudioSelect>
                            </div>
                          </>
                        ) : (
                          <div className="composer-control">
                            <StudioSelect
                              aria-label={translateUi("Preview viewport")}
                              value={viewport}
                              onValueChange={(value) => setViewport(value as "desktop" | "mobile")}
                            >
                              <StudioSelectOption value="desktop">
                                {translateUi("Desktop")}
                              </StudioSelectOption>
                              <StudioSelectOption value="mobile">
                                {translateUi("Mobile")}
                              </StudioSelectOption>
                            </StudioSelect>
                          </div>
                        )}

                        {outputType === "video" && (
                          <>
                            <div className="composer-control">
                              <StudioSelect
                                aria-label={translateUi("Video resolution")}
                                value={resolution}
                                onValueChange={(value) => setResolution(value as "1080p" | "1440p")}
                              >
                                <StudioSelectOption value="1080p">
                                  {translateUi("1080p · Full HD")}
                                </StudioSelectOption>
                                <StudioSelectOption value="1440p">
                                  {translateUi("2K · 1440p QHD")}
                                </StudioSelectOption>
                              </StudioSelect>
                            </div>
                            <div className="composer-control">
                              <StudioSelect
                                aria-label={translateUi("Frame rate")}
                                value={String(frameRate)}
                                onValueChange={(value) => setFrameRate(Number(value) as 30 | 60)}
                              >
                                <StudioSelectOption value="30">
                                  {translateUi("30 fps")}
                                </StudioSelectOption>
                                <StudioSelectOption value="60">
                                  {translateUi("60 fps")}
                                </StudioSelectOption>
                              </StudioSelect>
                            </div>
                          </>
                        )}
                        {outputType === "video" && (
                          <div className="composer-control">
                            <StudioSelect
                              aria-label={translateUi("Lyrics")}
                              value={lyricsEnabled ? "auto" : "off"}
                              onValueChange={(value) => setLyricsEnabled(value === "auto")}
                            >
                              <StudioSelectOption value="off">
                                {translateUi("Lyrics · Off")}
                              </StudioSelectOption>
                              <StudioSelectOption value="auto">
                                {translateUi("Lyrics · On")}
                              </StudioSelectOption>
                            </StudioSelect>
                          </div>
                        )}
                        <div className="composer-control">
                          <StudioSelect
                            aria-label={translateUi("Creative approach")}
                            aria-describedby="creative-approach-help"
                            disabled={manual}
                            value={preference}
                            onValueChange={(value) => setPreference(value as CreativeApproach)}
                          >
                            <StudioSelectOption value="context">
                              {manual
                                ? translateUi("Using your selected Motion Graphic")
                                : translateUi("Follow my brief")}
                            </StudioSelectOption>
                            <StudioSelectOption value="creative">
                              {manual
                                ? translateUi("Using your selected Motion Graphic")
                                : translateUi("Explore creative ideas")}
                            </StudioSelectOption>
                            <StudioSelectOption value="random">
                              {translateUi(creativeApproaches.random.label)}
                            </StudioSelectOption>
                          </StudioSelect>
                        </div>
                      </PromptInputTools>
                      <div className="composer-actions">
                        <PromptInputSubmit
                          className="primary composer-generate"
                          aria-label={
                            manual && count === 0
                              ? translateUi("Build full video")
                              : translateUi("Explore directions")
                          }
                          disabled={
                            busy ||
                            uploading ||
                            selectedStyleIds.length > styleLimit ||
                            instructions.trim().length < 8 ||
                            (!manual && preference !== "random" && !setup?.jevConfigured)
                          }
                        >
                          {busy ? (
                            <LoaderCircle className="spin" size={16} />
                          ) : (
                            <Sparkles size={16} />
                          )}{" "}
                          {translateUi("Generate") + " "}
                          <ArrowRight size={16} />
                        </PromptInputSubmit>
                      </div>
                    </PromptInputFooter>
                  </PromptInput>
                  <div className="composer-hint">
                    <span>
                      <Play size={14} />
                      {outputType === "page"
                        ? translateUi("Up to {{value0}} interactive page previews", {
                            value0: count,
                          })
                        : manual && count === 0
                          ? translateUi("Full video using your selected Motion Graphics")
                          : translateUi("Up to {{value0}} silent, 3-second previews", {
                              value0: count,
                            })}
                    </span>
                    <span>{translateUi("Enter to generate · Shift + Enter for a new line")}</span>
                  </div>
                  <p id="creative-approach-help" className="creative-approach-help">
                    {manual
                      ? translateUi(
                          "Use your chosen Motion Graphics for previews or a direct build. No style proposals or ranking calls.",
                        )
                      : translateUi(creativeApproaches[preference].description)}
                  </p>
                  {!manual && preference !== "random" && !setup?.jevConfigured && (
                    <div className="setup-note needs-setup">
                      <strong>{translateUi("Creation is currently unavailable")}</strong>
                      <p>{translateUi("Please check the app setup and try again.")}</p>
                    </div>
                  )}
                </Card>
              </div>
              <div className="inspiration-heading">
                <h2>{translateUi("Start with a visual direction")}</h2>
                <Button className="text-button" onClick={() => setPage("styles")}>
                  {translateUi("Explore all Motion Graphics") + " "}
                  <ArrowRight size={15} />
                </Button>
              </div>
              <div className="inspiration-grid">
                {["style-001", "style-107", "style-108"].map((id) => {
                  const s = styles.find((s) => s.id === id);
                  return s ? (
                    <StyleCard
                      key={id}
                      style={s}
                      variant="compact"
                      example={examples.find((example) => example.styleId === id)}
                      onSelect={openStyle}
                    />
                  ) : null;
                })}
              </div>
            </>
          )}
          <footer>
            {translateUi(
              "CODE-CREATED VISUALS · MOTION GRAPHIC-LED MOTION · LOCAL COMPOSITION & EXPORT",
            )}
          </footer>
        </main>
      </div>
      {deleteTarget && (
        <Dialog
          title={translateUi("Delete project?")}
          onClose={() => {
            if (!deleting) setDeleteTarget(undefined);
          }}
          footer={
            <div className="delete-actions">
              <Button
                className="secondary"
                disabled={deleting}
                onClick={() => setDeleteTarget(undefined)}
              >
                {translateUi("Cancel")}
              </Button>
              <Button
                type="primary"
                danger
                className="danger"
                disabled={deleting}
                onClick={() => void deleteProject()}
              >
                {deleting ? translateUi("Deleting…") : translateUi("Delete project")}
              </Button>
            </div>
          }
        >
          <p>
            <strong>{projectName(deleteTarget)}</strong>
          </p>
          <p>
            {translateUi(
              "This permanently deletes the project, its previews, source files, and activity history. Shared uploads are kept.",
            )}
          </p>
          {deleteError && <p role="alert">{customerErrorMessage(deleteError)}</p>}
        </Dialog>
      )}
      {detail &&
        styleDetailDialog(detail, () => {
          setSelectedStyleIds([detail.id]);
          if (preference === "random") setPreference("context");
          setDetail(undefined);
          newRequest(true);
        })}
    </MotionConfig>,
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <UiLanguageProvider>
        <App />
      </UiLanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
