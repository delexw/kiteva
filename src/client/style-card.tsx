import { translateUi, useUiLanguage } from "./i18n";
import { Button, Card, Popover } from "antd";
import { useViewportVisibility } from "./use-viewport-visibility";
import type { ReactNode } from "react";
import { memo, useEffect, useState, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import type { Style, StyleExample } from "../shared/contracts";

export function PaletteSwatches({
  tokens,
  backgroundPolicy,
  compact = false,
}: {
  tokens: Record<string, string>;
  backgroundPolicy?: Style["palette"]["background_policy"];
  compact?: boolean;
}) {
  useUiLanguage();
  const [openColor, setOpenColor] = useState<string | null>(null);
  const flexibleBackground = backgroundPolicy === "scene_dependent";
  const swatches = Object.entries(tokens).filter(
    ([key]) => !flexibleBackground || key !== "background",
  );
  if (compact)
    return (
      <div className="palette-circles" role="group" aria-label={translateUi("Color palette")}>
        {swatches.map(([key, color]) => (
          <Popover
            key={key}
            trigger="click"
            open={openColor === key}
            onOpenChange={(open) =>
              setOpenColor((current) => (open ? key : current === key ? null : current))
            }
            title={translateUi(key.replaceAll("_", " ").replaceAll("-", " "))}
            content={
              <div className="palette-color-details">
                <span
                  className="palette-color-preview"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <code>{color}</code>
              </div>
            }
          >
            <Button
              htmlType="button"
              className="palette-circle"
              style={{ background: color }}
              aria-label={translateUi("Show color details: {{value0}} {{value1}}", {
                value0: key,
                value1: color,
              })}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpenColor(null);
              }}
            />
          </Popover>
        ))}
      </div>
    );
  return (
    <div className="swatches" role="group" aria-label={translateUi("Color palette")}>
      {flexibleBackground && (
        <span className="palette-background-note">
          {translateUi("Background follows the scene")}
        </span>
      )}
      {swatches.map(([key, color]) => (
        <span
          key={key}
          className="palette-swatch"
          title={`${key}: ${color}`}
          aria-label={`${key} ${color}`}
        >
          <span className="palette-swatch-color" style={{ background: color }} aria-hidden="true" />
          <span className="palette-swatch-name">
            {translateUi(key.replaceAll("_", " ").replaceAll("-", " "))}
          </span>
          <code className="palette-swatch-value">{color}</code>
        </span>
      ))}
    </div>
  );
}
export function StyleExampleMedia({
  styleId,
  version,
  video,
  videoVersion,
  motionStatus,
  playbackEnabled = true,
  playOnOpen = false,
}: {
  styleId: string;
  version?: string;
  video?: string;
  videoVersion?: string;
  motionStatus?: StyleExample["motionStatus"];
  playbackEnabled?: boolean;
  playOnOpen?: boolean;
}) {
  useUiLanguage();
  const [failed, setFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const visible = useViewportVisibility(container);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    setFailed(false);
    setVideoFailed(false);
  }, [styleId, version, videoVersion]);
  const showVideo = Boolean(video) && !videoFailed && !reducedMotion && visible && playbackEnabled;
  const shouldPlay = showVideo;
  useEffect(() => {
    const el = player.current;
    if (!el) return;
    if (shouldPlay) void el.play().catch(() => {});
    else el.pause();
    return () => el.pause();
  }, [shouldPlay, video, videoVersion]);
  const poster = `/api/examples/${styleId}${version ? `?version=${encodeURIComponent(version)}` : ""}`;
  return (
    <div ref={container} className="example-media">
      {failed ? (
        <div className="example-placeholder">{translateUi("Claude example is being prepared")}</div>
      ) : showVideo ? (
        <video
          ref={player}
          className="example"
          src={`/api/examples/${styleId}/video?v=${encodeURIComponent(videoVersion || "")}`}
          poster={poster}
          muted
          autoPlay={playOnOpen && !reducedMotion}
          loop
          playsInline
          preload="none"
          onError={() => setVideoFailed(true)}
          aria-label={translateUi("Three-second silent Motion Graphic motion demo")}
        />
      ) : (
        <img
          className="example"
          src={poster}
          alt={translateUi("Claude-authored illustrative Motion Graphic study")}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <span className="motion-label">
        {videoFailed
          ? translateUi("Motion unavailable · retry by refreshing")
          : video
            ? reducedMotion
              ? translateUi("Motion demo · reduced motion")
              : shouldPlay
                ? translateUi("Playing · 3s motion demo")
                : translateUi("Paused · 3s motion demo")
            : motionStatus === "needs_repair"
              ? translateUi("Motion needs repair")
              : translateUi("Motion queued for preparation")}
      </span>
    </div>
  );
}
export type StyleCardData = Pick<Style, "id" | "name_en" | "category" | "visual_cues" | "palette">;
type StyleCardProps = {
  style: StyleCardData;
  example?: StyleExample;
  variant?: "explorer" | "compact";
  showCategory?: boolean;
  showDescription?: boolean;
  showId?: boolean;
  playbackEnabled?: boolean;
  media?: ReactNode;
  showPalette?: boolean;
  onSelect: (id: string) => void;
};
export const StyleCard = memo(function StyleCard({
  style,
  example,
  variant = "explorer",
  showCategory = variant === "explorer",
  showDescription = variant === "explorer",
  showId = variant === "explorer",
  playbackEnabled = true,
  media,
  showPalette = true,
  onSelect,
}: StyleCardProps) {
  useUiLanguage();
  return (
    <Card className="style-card-frame" hoverable styles={{ body: { padding: 0 } }}>
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`style-card style-card--${variant}`}
        data-style-id={style.id}
        onClick={() => onSelect(style.id)}
      >
        <div className="style-image">
          {media ?? (
            <>
              {!example ? (
                <div
                  className="example-media"
                  style={{
                    background:
                      style.palette.background_policy === "scene_dependent"
                        ? undefined
                        : style.palette.tokens.background,
                    color:
                      style.palette.background_policy === "scene_dependent"
                        ? undefined
                        : style.palette.tokens.foreground,
                  }}
                >
                  <div
                    className="example-placeholder"
                    style={{ background: "inherit", color: "inherit", height: "100%" }}
                  >
                    {translateUi("No preview generated")}
                  </div>
                  <span className="motion-label">
                    {translateUi("Palette only · no motion demo")}
                  </span>
                </div>
              ) : (
                <StyleExampleMedia
                  styleId={style.id}
                  playbackEnabled={playbackEnabled}
                  version={example?.generatedAt}
                  video={example?.video}
                  videoVersion={example?.videoGeneratedAt}
                  motionStatus={example?.motionStatus}
                />
              )}
              {!example?.video && (
                <span className="illustrative">
                  {!example
                    ? translateUi("PALETTE")
                    : example.source
                      ? translateUi("CLAUDE STUDY")
                      : translateUi("GENERATING")}
                </span>
              )}
            </>
          )}
          <span className="card-arrow">
            <ArrowUpRight size={18} />
          </span>
        </div>
        <div className="style-card-content">
          {showCategory && <div className="style-category">{translateUi(style.category)}</div>}
          <h3>{translateUi(style.name_en)}</h3>
          {showDescription && <p>{translateUi(style.visual_cues)}</p>}
          <div className="style-footer">{showId && <span>{style.id}</span>}</div>
        </div>
      </motion.button>
      {showPalette && (
        <div className="style-card-palette">
          <PaletteSwatches
            tokens={style.palette.tokens}
            backgroundPolicy={style.palette.background_policy}
            compact
          />
        </div>
      )}
    </Card>
  );
});
