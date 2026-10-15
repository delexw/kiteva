import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Badge, Button, Dropdown, Tooltip } from "antd";
import {
  Check,
  Clapperboard,
  CircleAlert,
  CloudUpload,
  Loader2,
  Maximize2,
  RotateCw,
  X,
} from "lucide-react";
import type { Run } from "../../shared/contracts";
import { projectName } from "../../shared/project-name";
import type { RoomWindowState } from "../../shared/room";
import type { RoomSaveStatus } from "./use-room-state";
import { roomUtilities, type RoomUtilityPage } from "./utility-windows";
import {
  roomDockLabel,
  roomProjectInitials,
  roomProjectPlacement,
  roomProjectSignals,
  roomProjectStatusText,
  roomProjectTone,
  roomProjectWindowKind,
} from "./window-lifecycle";

function ProjectGlyph({ project }: { project: Run }) {
  return (
    <span
      className="room-project-glyph"
      aria-hidden="true"
      style={{ "--room-project-tone": roomProjectTone(project.id) } as CSSProperties}
    >
      {roomProjectInitials(projectName(project))}
    </span>
  );
}

type DockProjectProps = {
  project: Run;
  window: RoomWindowState;
  onRestore: () => void;
  onClose: () => void;
};
/** Shift+F10 or the Menu key; macOS browsers never turn these into a contextmenu event. */
export function isDockMenuKey(event: Pick<KeyboardEvent, "key" | "shiftKey">) {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}
/** A minimized project window in the dock: icon only, with its name in the tooltip and label. */
export function RoomDockProject(props: DockProjectProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <RoomDockProjectTile {...props} menuOpen={menuOpen} onMenuOpenChange={setMenuOpen} />;
}
type DockMenuState = { menuOpen: boolean; onMenuOpenChange: (open: boolean) => void };
function dockTile({
  kind,
  name,
  label,
  tooltip,
  glyph,
  marks,
  onRestore,
  onClose,
  menuOpen,
  onMenuOpenChange,
}: DockMenuState & {
  kind: string;
  name: string;
  label: string;
  tooltip: ReactNode;
  glyph: ReactNode;
  marks?: ReactNode;
  onRestore: () => void;
  onClose: () => void;
}) {
  return (
    <Dropdown
      trigger={["contextMenu"]}
      open={menuOpen}
      onOpenChange={onMenuOpenChange}
      autoFocus
      menu={{
        items: [
          { key: "restore", label: "Restore" },
          { key: "close", label: "Close window" },
        ],
        onClick: ({ key }) => {
          onMenuOpenChange(false);
          if (key === "close") onClose();
          else onRestore();
        },
      }}
    >
      <span
        className="room-dock-project"
        data-kind={kind}
        onKeyDown={(event) => {
          if (!isDockMenuKey(event)) return;
          event.preventDefault();
          onMenuOpenChange(true);
        }}
      >
        <Tooltip title={tooltip}>
          <Button className="room-dock-project-button" aria-label={label} onClick={onRestore}>
            {glyph}
          </Button>
        </Tooltip>
        {marks}
        <Tooltip title="Close window">
          <Button
            type="text"
            size="small"
            className="room-dock-close"
            aria-label={`Close ${name}`}
            icon={<X size={10} strokeWidth={3} />}
            onClick={onClose}
          />
        </Tooltip>
      </span>
    </Dropdown>
  );
}
export function RoomDockProjectTile({
  project,
  window,
  onRestore,
  onClose,
  ...menu
}: DockProjectProps & DockMenuState) {
  const kind = roomProjectWindowKind(window.id);
  const { questions, working, failed } = roomProjectSignals(project);
  const status = roomProjectStatusText(project);
  const name = projectName(project);
  return dockTile({
    ...menu,
    kind,
    name,
    label: roomDockLabel(project, kind),
    tooltip: (
      <>
        <strong>{name}</strong>
        <br />
        {kind === "expanded" ? "Open project" : "Project card"}
        {status && ` · ${status}`}
      </>
    ),
    glyph: (
      <>
        <ProjectGlyph project={project} />
        {kind === "expanded" && (
          <Maximize2 className="room-dock-kind" size={9} strokeWidth={3} aria-hidden="true" />
        )}
      </>
    ),
    marks: (
      <>
        {questions > 0 && (
          <span className="room-attention-dot room-dock-attention" aria-hidden="true" />
        )}
        <span
          className={`room-dock-dot ${working ? "is-working" : failed ? "is-failed" : ""}`}
          aria-hidden="true"
        />
      </>
    ),
    onRestore,
    onClose,
  });
}

type DockUtilityProps = {
  page: RoomUtilityPage;
  title: string;
  onRestore: () => void;
  onClose: () => void;
};
/** A minimized tool window (style explorer, governance…) in the dock, icon only. */
export function RoomDockUtility(props: DockUtilityProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <RoomDockUtilityTile {...props} menuOpen={menuOpen} onMenuOpenChange={setMenuOpen} />;
}
export function RoomDockUtilityTile({
  page,
  title,
  onRestore,
  onClose,
  ...menu
}: DockUtilityProps & DockMenuState) {
  const Icon = roomUtilities[page].icon;
  return dockTile({
    ...menu,
    kind: "utility",
    name: title,
    label: `Restore ${title}, minimized`,
    tooltip: title,
    glyph: (
      <span className="room-utility-glyph" aria-hidden="true">
        <Icon size={16} />
      </span>
    ),
    onRestore,
    onClose,
  });
}

/** Every project, wherever its windows are, so a closed project is always one click away. */
export function RoomProjectsLauncher({
  projects,
  windows,
  activeProjectId,
  onShow,
  onShowAll,
}: {
  projects: Run[];
  windows: readonly RoomWindowState[];
  activeProjectId?: string;
  onShow: (project: Run) => void;
  onShowAll: () => void;
}) {
  const placements = new Map(
    projects.map((project) => [
      project.id,
      roomProjectPlacement(windows, project.id, activeProjectId),
    ]),
  );
  const closed = [...placements.values()].filter((placement) => placement.cardClosed).length;
  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        className: "room-projects-menu",
        style: { maxHeight: "min(60vh, 420px)", overflowY: "auto" },
        items: projects.length
          ? [
              {
                type: "group",
                label: "Projects",
                children: projects.map((project) => {
                  const status = roomProjectStatusText(project);
                  const placement = placements.get(project.id)!.label;
                  return {
                    key: project.id,
                    icon: <ProjectGlyph project={project} />,
                    label: projectName(project),
                    title: `${projectName(project)} · ${placement}${status ? ` · ${status}` : ""}`,
                    extra: (
                      <span className="room-projects-menu-state">
                        {roomProjectSignals(project).questions > 0 && (
                          <span className="room-attention-dot" aria-label="Waiting for you" />
                        )}
                        {placement}
                      </span>
                    ),
                  };
                }),
              },
              { type: "divider" },
              { key: "show-all", label: "Show all projects on the desktop", disabled: !closed },
            ]
          : [{ key: "none", label: "No projects yet", disabled: true }],
        onClick: ({ key }) => {
          if (key === "show-all") onShowAll();
          const project = projects.find((item) => item.id === key);
          if (project) onShow(project);
        },
      }}
    >
      <span>
        <Tooltip title={closed ? `Projects · ${closed} closed` : "Projects"}>
          <Badge className="room-dock-count" count={closed} size="small" offset={[-3, 3]}>
            <Button
              aria-label={`Projects${closed ? `, ${closed} closed` : ""}. Show a project on the desktop`}
              icon={<Clapperboard size={18} />}
            />
          </Badge>
        </Tooltip>
      </span>
    </Dropdown>
  );
}

const saveText: Record<RoomSaveStatus, string> = {
  loading: "Opening your room…",
  saving: "Saving…",
  unsaved: "Saving soon…",
  saved: "Saved on this computer",
  failed: "Not saved",
};
/** Room save state as a small icon; its text is in the tooltip and announced politely. */
export function RoomSaveStatusIcon({
  status,
  needsChoice,
  uploading,
  onRetry,
}: {
  status: RoomSaveStatus;
  needsChoice: boolean;
  uploading: boolean;
  onRetry: () => void;
}) {
  const text = status === "unsaved" && needsChoice ? "Needs your choice" : saveText[status];
  return (
    <span className="room-dock-status">
      {uploading && (
        <Tooltip title="Adding to your shelf…">
          <span className="room-dock-status-icon" role="status">
            <CloudUpload size={15} aria-hidden="true" />
            <span className="room-sr-only">Adding to your shelf…</span>
          </span>
        </Tooltip>
      )}
      {status === "failed" ? (
        <Tooltip title="Not saved · Retry">
          <Button
            danger
            size="small"
            aria-label="Room changes not saved. Retry saving"
            icon={<RotateCw size={14} />}
            onClick={onRetry}
          />
        </Tooltip>
      ) : (
        <Tooltip title={text}>
          <span className={`room-dock-status-icon is-${status}`} role="status" tabIndex={0}>
            {status === "saved" ? (
              <Check size={15} aria-hidden="true" />
            ) : needsChoice && status === "unsaved" ? (
              <CircleAlert size={15} aria-hidden="true" />
            ) : (
              <Loader2 size={15} className="room-spin" aria-hidden="true" />
            )}
            <span className="room-sr-only">{text}</span>
          </span>
        </Tooltip>
      )}
    </span>
  );
}
