import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { motion, useDragControls, useReducedMotion } from "motion/react";
import { Button, Tooltip } from "antd";
import { ArrowLeft, Minus, Maximize2, Minimize2, X } from "lucide-react";
import type { RoomWindowState } from "../../shared/room";
import { snapRoomWindow, type RoomArea, type RoomGeometry } from "./window-layout";

const arrowOffsets: Record<string, [number, number]> = {
  ArrowLeft: [-16, 0],
  ArrowRight: [16, 0],
  ArrowUp: [0, -16],
  ArrowDown: [0, 16],
};
export function RoomWindow({
  state,
  display,
  title,
  badge,
  children,
  desktop,
  area,
  onChange,
  onFocus,
  focused,
  layer,
  mobile = false,
  front = false,
  fill = false,
  closeHint = "Close window",
  onBack,
}: {
  state: RoomWindowState;
  display: RoomWindowState;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  desktop: RefObject<HTMLDivElement | null>;
  area: RoomArea;
  onChange: (next: RoomWindowState) => void;
  onFocus: () => void;
  focused: boolean;
  layer: number;
  mobile?: boolean;
  front?: boolean;
  fill?: boolean;
  closeHint?: string;
  onBack?: () => void;
}) {
  const controls = useDragControls();
  const reduced = useReducedMotion();
  const node = useRef<HTMLElement>(null);
  const expanded = state.maximized || mobile;
  const [resizing, setResizing] = useState<RoomGeometry>();
  const place = (geometry: Partial<RoomGeometry>) => {
    const { x, y, width, height } = display;
    onChange(
      snapRoomWindow(
        { ...state, x, y, width, height, ...geometry, placement: "user" as const },
        area,
      ),
    );
  };
  useEffect(() => {
    if (front) node.current?.focus();
  }, [front]);
  const move = (x: number, y: number) => place({ x, y });
  return (
    <motion.section
      ref={node}
      aria-label={title}
      className={`room-window ${focused ? "is-focused" : ""} ${expanded ? "is-maximized" : ""} ${front ? "is-mobile-front" : ""}`}
      tabIndex={-1}
      style={{
        width: expanded ? undefined : (resizing || display).width,
        height: expanded ? undefined : (resizing || display).height,
        x: expanded ? 0 : display.x,
        y: expanded ? 0 : display.y,
        zIndex: expanded && !mobile ? 40 : layer,
      }}
      initial={reduced ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      drag={!expanded}
      dragListener={false}
      dragControls={controls}
      dragConstraints={desktop}
      dragMomentum={false}
      dragElastic={0}
      onPointerDownCapture={onFocus}
      onFocusCapture={onFocus}
      onDragEnd={(_, info) => move(display.x + info.offset.x, display.y + info.offset.y)}
    >
      <header
        className="room-window-bar"
        onPointerDown={(event) => {
          if (!expanded && !(event.target as HTMLElement).closest("button,a,input"))
            controls.start(event);
        }}
        onDoubleClick={(event) => {
          if (!mobile && !(event.target as HTMLElement).closest("button,a,input"))
            onChange({ ...state, maximized: !state.maximized });
        }}
      >
        {!(mobile && front) && (
          <div className="room-window-controls">
            <Tooltip title={closeHint}>
              <Button
                type="text"
                className="room-traffic is-close"
                aria-label={`Close ${title}`}
                icon={
                  <span className="room-traffic-dot">
                    <X size={9} strokeWidth={3} />
                  </span>
                }
                onClick={() =>
                  onChange({ ...state, minimized: false, maximized: false, closed: true })
                }
              />
            </Tooltip>
            <Tooltip title="Minimize to dock">
              <Button
                type="text"
                className="room-traffic is-minimize"
                aria-label={`Minimize ${title}`}
                icon={
                  <span className="room-traffic-dot">
                    <Minus size={9} strokeWidth={3} />
                  </span>
                }
                onClick={() => onChange({ ...state, minimized: true })}
              />
            </Tooltip>
            {!mobile && (
              <Tooltip title={state.maximized ? "Restore size" : "Fill the room"}>
                <Button
                  type="text"
                  className={`room-traffic ${state.maximized ? "is-restore" : "is-zoom"}`}
                  aria-label={`${state.maximized ? "Restore" : "Expand"} ${title}`}
                  aria-pressed={state.maximized}
                  icon={
                    <span className="room-traffic-dot">
                      {state.maximized ? (
                        <Minimize2 size={8} strokeWidth={3} />
                      ) : (
                        <Maximize2 size={8} strokeWidth={3} />
                      )}
                    </span>
                  }
                  onClick={() => onChange({ ...state, maximized: !state.maximized })}
                />
              </Tooltip>
            )}
          </div>
        )}
        <span
          className="room-window-title"
          tabIndex={expanded ? -1 : 0}
          aria-label={expanded ? title : `${title}. Use arrow keys to move this window`}
          onKeyDown={(event) => {
            const offset = arrowOffsets[event.key];
            if (offset && !expanded) {
              event.preventDefault();
              move(display.x + offset[0], display.y + offset[1]);
            }
          }}
        >
          {title}
        </span>
        {badge}
        {mobile && front && (
          <Button
            size="small"
            className="room-window-back"
            icon={<ArrowLeft size={14} />}
            onClick={onBack}
          >
            Back to room
          </Button>
        )}
      </header>
      <div className={`room-window-content ${fill ? "is-fill" : ""}`}>{children}</div>
      {!expanded && (
        <button
          type="button"
          className="room-resize-grip"
          aria-label={`Resize ${title}. Drag, or use the arrow keys`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            const start = { pointerX: event.clientX, pointerY: event.clientY, ...display };
            const sizeAt = (moveX: number, moveY: number) => ({
              ...display,
              width: Math.max(280, start.width + moveX - start.pointerX),
              height: Math.max(180, start.height + moveY - start.pointerY),
            });
            const grip = event.currentTarget;
            const onMove = (move: PointerEvent) => setResizing(sizeAt(move.clientX, move.clientY));
            const onUp = (up: PointerEvent) => {
              grip.removeEventListener("pointermove", onMove);
              grip.removeEventListener("pointerup", onUp);
              grip.removeEventListener("pointercancel", onUp);
              setResizing(undefined);
              if (up.type === "pointerup") place(sizeAt(up.clientX, up.clientY));
            };
            grip.addEventListener("pointermove", onMove);
            grip.addEventListener("pointerup", onUp);
            grip.addEventListener("pointercancel", onUp);
          }}
          onKeyDown={(event) => {
            const offset = arrowOffsets[event.key];
            if (offset) {
              event.preventDefault();
              place({
                width: Math.max(280, display.width + offset[0]),
                height: Math.max(180, display.height + offset[1]),
              });
            }
          }}
        />
      )}
    </motion.section>
  );
}
