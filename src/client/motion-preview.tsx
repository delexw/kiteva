import { translateUi, useUiLanguage } from "./i18n";
import { useViewportVisibility } from "./use-viewport-visibility";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { drawMotionPreview, motionPreviewDuration } from "./motion-drawing";
export function MotionPreview({
  motionId,
  name,
  playbackEnabled = true,
  controls = false,
}: {
  motionId: string;
  name: string;
  playbackEnabled?: boolean;
  controls?: boolean;
}) {
  useUiLanguage();
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const visible = useViewportVisibility(container);
  const elapsed = useRef(0);
  const [position, setPosition] = useState(0);
  const [manualPause, setManualPause] = useState(false);
  const reducedMotion = useReducedMotion();
  const playing = visible && playbackEnabled && !manualPause && !reducedMotion;
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    let frame = 0,
      last = 0;
    const paint = (now: number) => {
      if (last) elapsed.current = (elapsed.current + (now - last) / 1000) % motionPreviewDuration;
      last = now;
      drawMotionPreview(context, motionId, elapsed.current);
      if (controls) setPosition(elapsed.current);
      frame = requestAnimationFrame(paint);
    };
    drawMotionPreview(context, motionId, reducedMotion ? motionPreviewDuration : elapsed.current);
    if (playing) frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [motionId, playing, reducedMotion, controls]);
  return (
    <div ref={container}>
      <div className="example-media motion-preview" data-motion-id={motionId}>
        <canvas
          ref={canvas}
          width={640}
          height={360}
          className="example"
          role="img"
          aria-label={translateUi("{{value0}} motion preview", { value0: translateUi(name) })}
        />
        <span className="motion-label">
          {reducedMotion
            ? translateUi("Still preview · reduced motion")
            : playing
              ? translateUi("Playing · 6s motion study")
              : translateUi("Paused · 6s motion study")}
        </span>
      </div>
      {controls && (
        <div className="motion-preview-controls">
          <button type="button" onClick={() => setManualPause((paused) => !paused)}>
            {manualPause ? translateUi("Play preview") : translateUi("Pause preview")}
          </button>
          <label>
            {translateUi("Preview time")}{" "}
            <input
              aria-label={translateUi("Preview time")}
              type="range"
              min="0"
              max={motionPreviewDuration}
              step="0.05"
              value={position}
              onChange={(event) => {
                const time = Number(event.target.value);
                elapsed.current = time;
                setPosition(time);
                setManualPause(true);
                const context = canvas.current?.getContext("2d");
                if (context) drawMotionPreview(context, motionId, time);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
