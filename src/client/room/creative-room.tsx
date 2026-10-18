import { UiLanguageSwitch, uiLanguages, uiLanguage } from "../i18n";
import { translateUi, useUiLanguage } from "../i18n";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Attachments, XProvider } from "@ant-design/x";
import { useReducedMotion } from "motion/react";
import { RoomFileCard } from "./room-file-card";
import {
  Alert,
  Badge,
  Button,
  ConfigProvider,
  Dropdown,
  Input,
  Modal,
  Tooltip,
  message,
} from "antd";
import {
  ChevronDown,
  Compass,
  FolderOpen,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  Palette,
  Plus,
} from "lucide-react";
import {
  roomEntryLabel,
  type RoomDraft,
  type RoomLibraryAsset,
  type RoomProjectView,
  type RoomWindowState,
} from "../../shared/room";
import { type Run, type StyleExample, isRunSettled } from "../../shared/contracts";
import { projectName } from "../../shared/project-name";
import { scopedAssetQuestions } from "../../shared/asset-question-scopes";
import { briefSectionFileAccept } from "../../shared/brief-sections";
import { ProjectMediaStack } from "../components/project-media-stack";
import { ProjectStatus } from "../components/project-status";
import { roomColors, roomCssVariables, roomTheme } from "../theme";
import { api } from "../lib/api";
import { RoomWindow } from "./room-window";
import { RoomErrorBoundary } from "./room-error-boundary";
import { useRoomState } from "./use-room-state";
import {
  autoRoomLayout,
  isRoomRouteWindow,
  keepRoomWindowInView,
  roomDockClearance,
  roomWindowPlacement,
} from "./window-layout";
import {
  arrangeRoomWindows,
  closeRoomWindow,
  ensureRoomWindows,
  isRoomWindowDisplayed,
  isRoomWindowInDock,
  isRoomWindowShown,
  openRoomWindow,
  roomMobileFront,
  showAllProjectWindows,
} from "./window-lifecycle";
import {
  RoomDockProject,
  RoomDockUtility,
  RoomProjectsLauncher,
  RoomSaveStatusIcon,
} from "./room-dock";
import {
  rememberRoomUtilityPath,
  roomLauncherUtilities,
  roomUtilities,
  roomUtilityPage,
  roomUtilityPath,
  roomUtilityWindowId,
  type RoomUtilityPage,
} from "./utility-windows";
import { appRoute } from "../lib/app-route";
import { RoomOnboarding } from "./room-onboarding";
import { RoomAppearanceDrawer } from "./room-appearance";
import { roomWallpaper } from "./wallpapers";
import { changeRoomAppearance } from "../../shared/room-appearance";
import { RoomQuestion } from "./room-question";
import { roomQuestionScope } from "./question-scope";
import {
  chooseRoomDraftStyle,
  emptyRoomDraft,
  roomDraftFromProject,
  roomMaterialSection,
  removeRoomEditDraft,
} from "./onboarding";
import type { StylePicker } from "../components/style-picker";
import "./room.css";

const shelfAccept = Object.values(briefSectionFileAccept).join(",");
const launcherItems = roomLauncherUtilities.map((page) => ({
  key: page,
  label: roomUtilities[page].title,
}));
type UploadedAsset = RoomLibraryAsset & { duplicate?: boolean };
const menuBarHeight = 60;
function roomViewportArea() {
  return {
    width: document.documentElement.clientWidth,
    height: Math.max(560, window.innerHeight - menuBarHeight),
  };
}
function isTyping() {
  const element = document.activeElement;
  return element instanceof HTMLElement && element.matches("input,textarea,[contenteditable=true]");
}

export function CreativeRoom({
  projects,
  active,
  styles,
  examples,
  projectContent,
  onOpen,
  onCreated,
  onDeleted,
  onHome,
  onLaunch,
  onNavigate,
  onUpdated,
  editSourceId,
  utility,
}: {
  projects: Run[];
  active?: Run;
  styles: Parameters<typeof StylePicker>[0]["styles"];
  examples: StyleExample[];
  projectContent?: (
    onQuestion: (id: string) => void,
    view: RoomProjectView,
    onView: (view: RoomProjectView) => void,
  ) => ReactNode;
  onOpen: (run: Run) => void;
  onCreated: (run: Run) => void;
  onDeleted: (id: string) => void;
  onHome: () => void;
  onLaunch: (page: string) => void;
  onNavigate: (path: string) => void;
  onUpdated: (run: Run) => void;
  editSourceId?: string | null;
  utility?: {
    page: RoomUtilityPage;
    path: string;
    content: (actions: { chooseStyle: (id: string, name: string) => void }) => ReactNode;
  };
}) {
  useUiLanguage();
  const saved = useRoomState();
  const { room, setRoom, loaded } = saved;
  const [front, setFront] = useState<string>();
  const [materials, setMaterials] = useState<RoomLibraryAsset[]>([]);
  const [stack, setStack] = useState<string[]>(["assistant"]);
  const [question, setQuestion] = useState<{ runId: string; id: string }>();
  const [error, setError] = useState("");
  const [toast, toastHolder] = message.useMessage({ top: 76, maxCount: 3 });
  const [modal, modalHolder] = Modal.useModal();
  const [uploading, setUploading] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [area, setArea] = useState(roomViewportArea);
  const [conversation, setConversation] = useState("new");
  const [rename, setRename] = useState<RoomLibraryAsset>();
  const [renameText, setRenameText] = useState("");
  const [focusTick, setFocusTick] = useState(0);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();
  const desktop = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const all = active ? [active, ...projects.filter((p) => p.id !== active.id)] : projects;
  const focused = stack.at(-1);
  const routeWindowId = active
    ? `detail:${active.id}`
    : utility
      ? roomUtilityWindowId(utility.page)
      : undefined;
  const refreshMaterials = () => api<RoomLibraryAsset[]>("/api/room/library").then(setMaterials);
  useEffect(() => {
    refreshMaterials().catch((e) =>
      setError(
        translateUi("Could not open your material shelf: {{value0}}", {
          value0: (e as Error).message,
        }),
      ),
    );
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const previous = { scheme: root.style.colorScheme, background: root.style.background };
    root.style.colorScheme = "dark";
    root.style.background = roomColors.desktop;
    return () => {
      root.style.colorScheme = previous.scheme;
      root.style.background = previous.background;
    };
  }, []);
  useEffect(() => {
    const update = () =>
      setArea((previous) => {
        const next = roomViewportArea();
        return next.width === previous.width && next.height === previous.height ? previous : next;
      });
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  useEffect(() => {
    const update = () => setFocusTick((tick) => tick + 1);
    document.addEventListener("focusout", update);
    return () => document.removeEventListener("focusout", update);
  }, []);
  const raise = (id: string) =>
    setStack((previous) =>
      previous.at(-1) === id ? previous : [...previous.filter((item) => item !== id), id],
    );
  const patchWindow = (next: RoomWindowState) =>
    setRoom((previous) => ({
      ...previous,
      windows: previous.windows.map((w) => (w.id === next.id ? next : w)),
    }));
  const reveal = (id: string, takeOver = true) => {
    raise(id);
    if (takeOver && window.matchMedia("(max-width: 720px)").matches && !id.startsWith("project:"))
      setFront(id);
    setRoom((previous) => ({ ...previous, windows: openRoomWindow(previous.windows, id) }));
  };
  const closeWindow = (id: string) =>
    setRoom((previous) => ({ ...previous, windows: closeRoomWindow(previous.windows, id) }));
  useEffect(() => {
    if (!loaded) return;
    const withFixedWindows = !initialized.current;
    initialized.current = true;
    setRoom((previous) => {
      const windows = ensureRoomWindows(
        previous.windows,
        projects.map((project) => project.id),
        withFixedWindows,
      );
      return windows === previous.windows ? previous : { ...previous, windows };
    });
  }, [loaded, projects.map((p) => p.id).join("|")]);
  useEffect(() => {
    if (loaded && window.location.pathname === "/" && !active && !editSourceId) {
      setConversation("new");
      reveal("assistant");
    }
  }, [loaded]);
  useEffect(() => {
    if (loaded && utility) reveal(roomUtilityWindowId(utility.page));
  }, [loaded, utility?.page]);
  useEffect(() => {
    if (!loaded || !utility) return;
    setRoom((previous) => {
      const windows = rememberRoomUtilityPath(previous.windows, utility.page, utility.path);
      return windows === previous.windows ? previous : { ...previous, windows };
    });
  }, [loaded, utility?.page, utility?.path]);
  useEffect(() => {
    if (loaded && active) {
      reveal(`detail:${active.id}`);
      setConversation(active.id);
    }
  }, [loaded, active?.id]);
  useEffect(() => {
    if (!loaded || !editSourceId) return;
    const key = `edit:${editSourceId}`;
    setConversation(key);
    reveal("assistant");
    if (room.drafts[key]) return;
    let disposed = false;
    void Promise.all([
      api<Run>(`/api/runs/${editSourceId}`),
      api<{ assets: Array<{ id: string; originalName: string; bytes?: number }> }>(
        `/api/runs/${editSourceId}/assets`,
      ),
    ])
      .then(([source, attachments]) => {
        if (disposed) return;
        const draft = roomDraftFromProject(
          source.request,
          attachments.assets.map((asset) => ({ ...asset, kind: "", bytes: asset.bytes || 0 })),
        );
        setRoom((previous) => ({ ...previous, drafts: { ...previous.drafts, [key]: draft } }));
      })
      .catch((e) =>
        setError(
          translateUi("Could not load that project’s brief: {{value0}}", {
            value0: (e as Error).message,
          }),
        ),
      );
    return () => {
      disposed = true;
    };
  }, [loaded, editSourceId]);
  useEffect(() => {
    if (!loaded || question || isTyping()) return;
    const pending = all.flatMap((run) =>
      scopedAssetQuestions(run)
        .filter(
          (q) =>
            q.state === "open" && q.mode === "blocking" && !room.dismissedQuestions.includes(q.id),
        )
        .map((q) => ({ runId: run.id, id: q.id })),
    )[0];
    if (pending) {
      setQuestion(pending);
      setConversation(pending.runId);
      reveal("assistant", false);
    }
  }, [loaded, projects, active, question, room.dismissedQuestions, focusTick]);
  const current = all.find((run) => run.id === (question?.runId || conversation));
  const currentQuestion =
    current &&
    scopedAssetQuestions(current).find((q) => q.id === question?.id && q.state === "open");
  const openQuestion = (runId: string, id: string) => {
    setQuestion({ runId, id });
    setConversation(runId);
    reveal("assistant");
  };
  useEffect(() => {
    if (question && current && !currentQuestion) setQuestion(undefined);
  }, [current, currentQuestion, question]);
  async function upload(files: File[]): Promise<RoomLibraryAsset[]> {
    setUploading(true);
    setError("");
    const added: RoomLibraryAsset[] = [];
    const problems: string[] = [];
    const duplicates: string[] = [];
    for (const file of files) {
      if (!roomMaterialSection(file.name)) {
        problems.push(
          `${file.name}: use documents (${briefSectionFileAccept.main}), images or audio`,
        );
        continue;
      }
      try {
        const form = new FormData();
        form.append("file", file);
        const asset = await api<UploadedAsset>("/api/room/library", { method: "POST", body: form });
        if (asset.duplicate) duplicates.push(asset.originalName);
        added.push(asset);
      } catch (e) {
        problems.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    await refreshMaterials().catch(() => {});
    setUploading(false);
    if (problems.length) void toast.error(problems.join(" · "), 8);
    if (duplicates.length)
      void toast.info(
        translateUi("Already on your shelf: {{value0}}", { value0: duplicates.join(", ") }),
        4,
      );
    return added;
  }
  const openQuestions = (run: Run) => scopedAssetQuestions(run).filter((q) => q.state === "open");
  const questionCount = all.reduce((total, run) => total + openQuestions(run).length, 0);
  const projectFor = (id: string) => all.find((run) => id.endsWith(`:${run.id}`));
  const utilityTitle = (page: RoomUtilityPage) => {
    const path =
      utility?.page === page
        ? utility.path
        : room.windows.find((w) => w.id === roomUtilityWindowId(page))?.path;
    const project =
      page === "storyboard" && path
        ? all.find((run) => run.id === appRoute(path.split("?")[0]).projectId)
        : undefined;
    return project
      ? `${translateUi(roomUtilities[page].title)} · ${projectName(project)}`
      : translateUi(roomUtilities[page].title);
  };
  const windowTitle = (id: string) => {
    const page = roomUtilityPage(id);
    return id === "assistant"
      ? translateUi("Assistant")
      : id === "library"
        ? translateUi("Material shelf")
        : page
          ? utilityTitle(page)
          : projectName(projectFor(id)!);
  };
  function chooseStyle(id: string, name: string) {
    setRoom((previous) => ({
      ...previous,
      drafts: { ...previous.drafts, new: chooseRoomDraftStyle(previous.drafts.new, id) },
    }));
    setConversation("new");
    setQuestion(undefined);
    reveal("assistant");
    onHome();
    void toast.success(
      translateUi("{{value0}} is now the Motion Graphic for your new idea", { value0: name }),
      4,
    );
  }
  const draftKeys = Object.keys(room.drafts).filter((key) => key.startsWith("edit:"));
  const conversationItems = [
    { key: "new", label: translateUi("New idea") },
    ...draftKeys.map((key) => {
      const source = all.find((run) => `edit:${run.id}` === key);
      return {
        key,
        label: translateUi("Edit · {{value0}}", {
          value0: source ? projectName(source) : "earlier project",
        }),
      };
    }),
    ...(all.length
      ? [
          { type: "divider" as const },
          ...all.map((run) => ({
            key: run.id,
            label: projectName(run),
            extra: openQuestions(run).length ? (
              <span className="room-attention-dot" aria-label={translateUi("Waiting for you")} />
            ) : undefined,
          })),
        ]
      : []),
  ];
  const conversationKey = currentQuestion && current ? current.id : conversation;
  const conversationLabel =
    conversationItems.find((item) => "key" in item && item.key === conversationKey)?.label ||
    "New idea";
  const displayWindows = room.windows
    .filter(
      (w) =>
        isRoomWindowDisplayed(w, routeWindowId) &&
        (w.id === "assistant" ||
          w.id === "library" ||
          (w.id.startsWith("project:") && projectFor(w.id)) ||
          isRoomRouteWindow(w.id)),
    )
    .sort((a, b) =>
      mobile
        ? Number(isRoomRouteWindow(b.id)) - Number(isRoomRouteWindow(a.id)) ||
          Number(b.id === "assistant") - Number(a.id === "assistant")
        : 0,
    );
  const dockWindows = room.windows.filter(
    (w) => isRoomWindowInDock(w) && w.id !== "library" && w.id !== "assistant" && projectFor(w.id),
  );
  const dockUtilities = room.windows.flatMap((w) => {
    const page = roomUtilityPage(w.id);
    const path = roomUtilityPath(w);
    return page && path && isRoomWindowInDock(w) ? [{ id: w.id, page, path }] : [];
  });
  const wallpaper = roomWallpaper(room.appearance);
  const mobileFront = mobile
    ? roomMobileFront(
        displayWindows.map((w) => w.id),
        front,
        routeWindowId,
      )
    : undefined;
  const frontOpen = Boolean(mobileFront);
  const tileOrder = (id: string) => {
    const index = all.findIndex((run) => id.endsWith(`:${run.id}`));
    return id === "assistant" ? -2 : id === "library" ? -1 : index;
  };
  const layout = autoRoomLayout(
    displayWindows
      .filter((w) => roomWindowPlacement(w) === "auto")
      .map((w) => w.id)
      .sort((a, b) => tileOrder(a) - tileOrder(b)),
    area,
  );
  const displayed = (state: RoomWindowState) => {
    const tile = layout.get(state.id);
    return tile && state.id.startsWith("project:")
      ? { ...state, ...tile }
      : keepRoomWindowInView({ ...state, ...tile }, area);
  };
  const contentBottom = Math.max(
    0,
    ...displayWindows
      .filter((w) => !w.maximized)
      .map((w) => {
        const shown = displayed(w);
        return shown.y + shown.height;
      }),
  );
  const setView = (id: string, view: RoomProjectView) =>
    setRoom((previous) => ({ ...previous, views: { ...previous.views, [id]: view } }));
  const conflictLabel = (entry: string) => {
    const key = roomEntryLabel(entry);
    if (entry.startsWith("drafts:"))
      return key === "new"
        ? "your new idea draft"
        : `your edited brief${projectFor(key) ? ` for ${projectName(projectFor(key)!)}` : ""}`;
    if (entry.startsWith("views:")) {
      const project = all.find((run) => run.id === key);
      return `your fine-tune note for ${project ? projectName(project) : "a project"}`;
    }
    return "a reply you were writing";
  };
  const setDraft = (key: string, draft: RoomDraft) =>
    setRoom((previous) => ({ ...previous, drafts: { ...previous.drafts, [key]: draft } }));
  function arrange() {
    setRoom((previous) => ({
      ...previous,
      windows: arrangeRoomWindows(previous.windows, routeWindowId),
    }));
    onHome();
  }
  async function removeMaterial(asset: RoomLibraryAsset) {
    await api(`/api/room/library/${asset.id}`, { method: "DELETE" });
    setMaterials((previous) => previous.filter((item) => item.id !== asset.id));
  }
  function confirmRemoveMaterial(asset: RoomLibraryAsset) {
    modal.confirm({
      title: translateUi("Remove {{value0}} from your shelf?", { value0: asset.originalName }),
      content: translateUi("Projects and drafts that already use it keep their copy."),
      okText: translateUi("Remove"),
      onOk: () => removeMaterial(asset),
    });
  }
  function assistantContent() {
    if (currentQuestion && current)
      return (
        <RoomQuestion
          key={currentQuestion.id}
          run={current}
          question={currentQuestion}
          draft={room.questionDrafts[`${current.id}:${currentQuestion.id}`] || ""}
          onDraft={(text) =>
            setRoom((previous) => ({
              ...previous,
              questionDrafts: {
                ...previous.questionDrafts,
                [`${current.id}:${currentQuestion.id}`]: text,
              },
            }))
          }
          materials={materials}
          onUpdated={(updated) => {
            onUpdated(updated);
            setQuestion(undefined);
          }}
        />
      );
    if (conversation === "new" || conversation.startsWith("edit:"))
      return (
        <RoomOnboarding
          key={conversation}
          draft={room.drafts[conversation] || emptyRoomDraft()}
          onChange={(draft) => setDraft(conversation, draft)}
          materials={materials}
          styles={styles}
          examples={examples}
          onUpload={upload}
          onDeleteMaterial={removeMaterial}
          onCreated={(run) => {
            setRoom((previous) => {
              const drafts = { ...previous.drafts };
              delete drafts[conversation];
              return {
                ...previous,
                drafts: conversation === "new" ? { ...drafts, new: emptyRoomDraft() } : drafts,
                windows: previous.windows.map((w) =>
                  w.id === "assistant" ? { ...w, minimized: true } : w,
                ),
              };
            });
            onCreated(run);
          }}
        />
      );
    if (!current)
      return <p className="room-hint room-pad">{translateUi("Choose a conversation.")}</p>;
    const waiting = openQuestions(current);
    return (
      <div className="room-assistant-project">
        <h3>{projectName(current)}</h3>
        <ProjectStatus phase={current.phase} />
        {waiting.map((q) => (
          <button
            type="button"
            key={`${q.id}:${q.jobId || ""}`}
            className="room-question-row"
            onClick={() => openQuestion(current.id, q.id)}
          >
            <span className="room-attention-dot" />
            <span>
              <small>{roomQuestionScope(current, q.jobId)}</small>
              {q.question}
            </span>
          </button>
        ))}
        {!waiting.length && (
          <p className="room-hint">
            {translateUi(
              "No questions waiting. Open the project to compare directions or fine-tune a film.",
            )}
          </p>
        )}
        <Button type="primary" onClick={() => onOpen(current)}>
          {translateUi("Open project")}
        </Button>
      </div>
    );
  }
  function libraryContent() {
    return (
      <div className="room-library">
        <Attachments
          multiple
          accept={shelfAccept}
          items={[]}
          beforeUpload={(file, list) => {
            if (file === list[0]) void upload(list);
            return false;
          }}
          placeholder={{
            title: uploading
              ? translateUi("Adding to your shelf…")
              : translateUi("Drop files here or click to choose"),
            description: translateUi(
              "Documents, images and audio stay on your shelf. Project limits apply only when you pick them.",
            ),
          }}
        />
        <p className="room-hint">
          {materials.length}
          {" " + translateUi("on your shelf · each project can use up to 12 files")}
        </p>
        <ul className="room-library-items">
          {materials.map((asset) => (
            <li key={asset.id}>
              <RoomFileCard asset={asset} />
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    { key: "rename", label: translateUi("Rename") },
                    { key: "download", label: translateUi("Download") },
                    { key: "remove", label: translateUi("Remove from shelf"), danger: true },
                  ],
                  onClick: ({ key }) => {
                    if (key === "rename") {
                      setRename(asset);
                      setRenameText(asset.originalName);
                    } else if (key === "download")
                      window.open(`/api/room/library/${asset.id}/file`, "_blank", "noopener");
                    else confirmRemoveMaterial(asset);
                  },
                }}
              >
                <Button
                  type="text"
                  size="small"
                  aria-label={translateUi("More for {{value0}}", { value0: asset.originalName })}
                  icon={<MoreHorizontal size={16} />}
                />
              </Dropdown>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  function projectWidget(project: Run) {
    const waiting = openQuestions(project);
    return (
      <div className="room-project-widget">
        <ProjectMediaStack project={project} onOpen={() => onOpen(project)} />
        <div className="room-widget-actions">
          <ProjectStatus phase={project.phase} />
          {waiting.length > 0 && (
            <Button
              size="small"
              className="room-question-badge"
              onClick={() => openQuestion(project.id, waiting[0].id)}
            >
              <span className="room-attention-dot" />
              {waiting.length}
              {" " + translateUi("question")}
              {waiting.length === 1 ? "" : "s"}
            </Button>
          )}
          <Button
            type="primary"
            size="small"
            className="room-widget-open"
            aria-label={translateUi("Open {{value0}}", { value0: projectName(project) })}
            onClick={() => onOpen(project)}
          >
            {translateUi("Open")}
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                {
                  key: "delete",
                  label: isRunSettled(project)
                    ? translateUi("Delete project")
                    : translateUi("Delete (after work stops)"),
                  danger: true,
                  disabled: !isRunSettled(project),
                },
              ],
              onClick: () =>
                modal.confirm({
                  title: translateUi("Delete {{value0}}?", { value0: projectName(project) }),
                  content: translateUi(
                    "Its previews and films will be removed. Your shelf is not affected.",
                  ),
                  okText: translateUi("Delete"),
                  okButtonProps: { danger: true },
                  onOk: async () => {
                    await api(`/api/runs/${project.id}`, { method: "DELETE" });
                    setRoom((previous) => ({
                      ...previous,
                      windows: previous.windows.filter((w) => !w.id.endsWith(`:${project.id}`)),
                    }));
                    onDeleted(project.id);
                  },
                }),
            }}
          >
            <Button
              type="text"
              size="small"
              aria-label={translateUi("More for {{value0}}", { value0: projectName(project) })}
              icon={<MoreHorizontal size={16} />}
            />
          </Dropdown>
        </div>
        <p className="room-widget-description">
          {project.brief?.objective || project.request.instructions}
        </p>
      </div>
    );
  }
  return (
    <XProvider
      locale={{ ...uiLanguages[uiLanguage.language].antd, ...uiLanguages[uiLanguage.language].x }}
      theme={
        reducedMotion ? { ...roomTheme, token: { ...roomTheme.token, motion: false } } : roomTheme
      }
    >
      <div
        ref={setSurface}
        className={`creative-room ${frontOpen ? "has-mobile-front" : ""}`}
        style={roomCssVariables as CSSProperties}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length && !event.defaultPrevented) {
            event.preventDefault();
            void upload(Array.from(event.dataTransfer.files)).then(() => reveal("library"));
          }
        }}
      >
        <header className="room-menu-bar">
          <a
            className="room-brand"
            href="/projects"
            onClick={(e) => {
              e.preventDefault();
              onHome();
            }}
          >
            <img src="/kiteva-mark.svg" alt="" />
            {translateUi("kiteva") + " "}
            <span>{translateUi("your creative room")}</span>
          </a>
          <nav className="room-menu-actions" aria-label={translateUi("Room")}>
            <UiLanguageSwitch />
            <Button
              type="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                setConversation("new");
                setQuestion(undefined);
                reveal("assistant");
              }}
            >
              {translateUi("New idea")}
            </Button>
            <Tooltip
              title={translateUi(
                "Line up visible windows. Minimized and closed windows stay as they are.",
              )}
            >
              <Button icon={<LayoutGrid size={15} />} onClick={arrange}>
                {translateUi("Arrange")}
              </Button>
            </Tooltip>
            <Dropdown
              menu={{
                items: [
                  ...launcherItems.map((item) => ({ ...item, label: translateUi(item.label) })),
                  { type: "divider" },
                  { key: "appearance", label: translateUi("Desktop appearance…") },
                ],
                onClick: ({ key }) =>
                  key === "appearance" ? setAppearanceOpen(true) : onLaunch(key),
              }}
            >
              <Button icon={<Compass size={15} />}>{translateUi("Explore")}</Button>
            </Dropdown>
          </nav>
        </header>
        {toastHolder}
        <RoomAppearanceDrawer
          open={appearanceOpen}
          onClose={() => setAppearanceOpen(false)}
          appearance={room.appearance}
          onChange={(change) =>
            setRoom((previous) => ({
              ...previous,
              appearance: changeRoomAppearance(previous.appearance, change),
            }))
          }
        />
        {modalHolder}
        <div className="room-notices" aria-live="polite">
          {saved.conflicts.map((entry) => (
            <Alert
              key={entry}
              className="room-error"
              type="warning"
              showIcon
              title={translateUi("Another tab changed {{value0}}.", {
                value0: conflictLabel(entry),
              })}
              description={translateUi(
                "This tab still shows your version. Choose which one to keep.",
              )}
              action={
                <span className="room-conflict-actions">
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => saved.resolveConflict(entry, true)}
                  >
                    {translateUi("Keep this tab’s")}
                  </Button>
                  <Button size="small" onClick={() => saved.resolveConflict(entry, false)}>
                    {translateUi("Use the other tab’s")}
                  </Button>
                </span>
              }
            />
          ))}
          {saved.status === "failed" && saved.error && (
            <Alert
              className="room-error"
              type="error"
              showIcon
              title={translateUi("Your room changes aren’t saved yet.")}
              description={translateUi("{{value0}} They stay in this tab; retry from the dock.", {
                value0: saved.error,
              })}
            />
          )}
          {error && (
            <Alert
              className="room-error"
              type="error"
              showIcon
              title={error}
              closable
              onClose={() => setError("")}
            />
          )}
        </div>
        <div
          className="room-desktop"
          ref={desktop}
          aria-label={translateUi("Creative desktop")}
          style={{
            minHeight: mobile
              ? undefined
              : `max(calc(100dvh - ${menuBarHeight}px), ${contentBottom + roomDockClearance}px)`,
          }}
        >
          <div
            className="room-wallpaper"
            aria-hidden="true"
            data-wallpaper={wallpaper.id}
            style={wallpaper.variables as CSSProperties}
          >
            <div className="room-wallpaper-scene" />
            <div className="room-wallpaper-image" />
            <span />
            <span />
            <span />
            <div className="room-wallpaper-dim" />
          </div>
          {!loaded && !error && <p className="room-empty">{translateUi("Opening your room…")}</p>}
          {loaded && !projects.length && (
            <div className="room-welcome">
              <span>{translateUi("IDEAS TAKE FLIGHT")}</span>
              <h1>
                {translateUi("Your room.")}
                <br />
                {translateUi("Your next story.")}
              </h1>
              <p>{translateUi("Drop in your references, then tell the assistant your idea.")}</p>
            </div>
          )}
          {displayWindows.map((state) => {
            const project = state.id.startsWith("project:") ? projectFor(state.id) : undefined;
            const waiting = project ? openQuestions(project).length : 0;
            return (
              <RoomWindow
                key={state.id}
                state={state}
                display={displayed(state)}
                fill={state.id === "assistant" || state.id.startsWith("detail:")}
                closeHint={
                  project || state.id.startsWith("detail:")
                    ? "Close window · the project and its work stay safe"
                    : "Close window"
                }
                title={windowTitle(state.id)}
                badge={
                  waiting > 0 && (
                    <span
                      className="room-attention-dot"
                      aria-label={translateUi("{{value0}} waiting", { value0: waiting })}
                    />
                  )
                }
                desktop={desktop}
                area={area}
                focused={focused === state.id}
                layer={2 + Math.max(0, stack.indexOf(state.id))}
                onFocus={() => raise(state.id)}
                mobile={mobile}
                front={mobileFront === state.id}
                onBack={() => {
                  setFront(undefined);
                  if (isRoomRouteWindow(state.id)) onHome();
                }}
                onChange={(next) => {
                  patchWindow(next);
                  const hidden = !isRoomWindowShown(next);
                  if (hidden && front === state.id) setFront(undefined);
                  if (hidden && isRoomRouteWindow(state.id)) onHome();
                  if (hidden && state.id === "assistant" && question) {
                    setRoom((previous) => ({
                      ...previous,
                      dismissedQuestions: [...previous.dismissedQuestions, question.id].slice(
                        -1000,
                      ),
                    }));
                    setQuestion(undefined);
                  }
                }}
              >
                <RoomErrorBoundary label={windowTitle(state.id)}>
                  {state.id === "library" ? (
                    libraryContent()
                  ) : state.id === "assistant" ? (
                    <div className="room-assistant">
                      <div className="room-assistant-bar">
                        <Dropdown
                          trigger={["click"]}
                          menu={{
                            selectable: true,
                            selectedKeys: [conversationKey],
                            items: conversationItems,
                            onClick: ({ key }) => {
                              setConversation(key);
                              setQuestion(undefined);
                            },
                          }}
                        >
                          <Button
                            type="text"
                            className="room-conversation-switch"
                            aria-label={translateUi("Conversation: {{value0}}. Choose another", {
                              value0: conversationLabel,
                            })}
                          >
                            <span>{conversationLabel}</span>
                            <ChevronDown size={14} />
                          </Button>
                        </Dropdown>
                        {conversation.startsWith("edit:") && room.drafts[conversation] && (
                          <Button
                            type="text"
                            danger
                            size="small"
                            onClick={() => {
                              const draftKey = conversation;
                              modal.confirm({
                                title: translateUi("Remove this editing draft?"),
                                content: translateUi(
                                  "The project, videos and material shelf will be kept.",
                                ),
                                okText: translateUi("Remove draft"),
                                okButtonProps: { danger: true },
                                onOk: () => {
                                  setRoom((previous) => ({
                                    ...previous,
                                    drafts: removeRoomEditDraft(previous.drafts, draftKey),
                                  }));
                                  setConversation("new");
                                  setQuestion(undefined);
                                  if (draftKey === `edit:${editSourceId}`) onHome();
                                },
                              });
                            }}
                          >
                            {translateUi("Remove draft")}
                          </Button>
                        )}
                        {questionCount > 0 && (
                          <span className="room-hint">
                            {questionCount}
                            {" " + translateUi("waiting for you")}
                          </span>
                        )}
                      </div>
                      <div className="room-assistant-body">{assistantContent()}</div>
                    </div>
                  ) : roomUtilityPage(state.id) && utility ? (
                    <ConfigProvider getPopupContainer={() => surface || document.body}>
                      <div className="room-utility">{utility.content({ chooseStyle })}</div>
                    </ConfigProvider>
                  ) : state.id.startsWith("detail:") && active ? (
                    projectContent?.(
                      (id) => openQuestion(active.id, id),
                      room.views[active.id] || { refine: "" },
                      (view) => setView(active.id, view),
                    )
                  ) : (
                    project && projectWidget(project)
                  )}
                </RoomErrorBoundary>
              </RoomWindow>
            );
          })}
        </div>
        <footer className="room-dock" aria-label={translateUi("Dock")}>
          <Tooltip title={translateUi("Material shelf")}>
            <Button
              aria-label={translateUi("Open material shelf")}
              icon={<FolderOpen size={18} />}
              onClick={() => reveal("library")}
            />
          </Tooltip>
          <Tooltip title={translateUi("Desktop appearance")}>
            <Button
              aria-label={translateUi("Change desktop appearance")}
              aria-expanded={appearanceOpen}
              icon={<Palette size={18} />}
              onClick={() => setAppearanceOpen(true)}
            />
          </Tooltip>
          <Tooltip title={translateUi("Assistant")}>
            <Badge count={questionCount} size="small" color={roomColors.activity}>
              <Button
                aria-label={translateUi("Open assistant{{value0}}", {
                  value0: questionCount ? `, ${questionCount} questions waiting` : "",
                })}
                icon={<MessageCircle size={18} />}
                onClick={() => reveal("assistant")}
              />
            </Badge>
          </Tooltip>
          <span className="room-dock-divider" aria-hidden="true" />
          <RoomProjectsLauncher
            projects={all}
            windows={room.windows}
            activeProjectId={active?.id}
            onShow={(project) => reveal(`project:${project.id}`)}
            onShowAll={() =>
              setRoom((previous) => ({
                ...previous,
                windows: showAllProjectWindows(
                  previous.windows,
                  all.map((run) => run.id),
                ),
              }))
            }
          />
          {dockWindows.length + dockUtilities.length > 0 && (
            <div
              className="room-dock-windows"
              role="group"
              aria-label={translateUi("Minimized windows")}
            >
              {dockUtilities.map(({ id, page, path }) => (
                <RoomDockUtility
                  key={id}
                  page={page}
                  title={utilityTitle(page)}
                  onRestore={() => onNavigate(path)}
                  onClose={() => closeWindow(id)}
                />
              ))}
              {dockWindows.map((w) => {
                const project = projectFor(w.id)!;
                return (
                  <RoomDockProject
                    key={w.id}
                    project={project}
                    window={w}
                    onRestore={() => {
                      if (w.id.startsWith("detail:")) onOpen(project);
                      else reveal(w.id);
                    }}
                    onClose={() => closeWindow(w.id)}
                  />
                );
              })}
            </div>
          )}
          <RoomSaveStatusIcon
            status={saved.status}
            needsChoice={saved.conflicts.length > 0}
            uploading={uploading}
            onRetry={() => void saved.retry()}
          />
        </footer>
        <Modal
          title={translateUi("Rename material")}
          open={Boolean(rename)}
          onCancel={() => setRename(undefined)}
          onOk={async () => {
            if (!rename) return;
            try {
              await api(`/api/room/library/${rename.id}`, {
                method: "PATCH",
                body: JSON.stringify({ originalName: renameText }),
              });
              await refreshMaterials();
              setRename(undefined);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Input
            aria-label={translateUi("Material name")}
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
          />
        </Modal>
      </div>
    </XProvider>
  );
}
