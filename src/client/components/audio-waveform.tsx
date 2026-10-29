import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { translateUi } from "../i18n";

/** Inspection only: the delivered video remains the sole playback source. */
export function AudioWaveform({ src }: { src: string }) {
  const container = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    if (!container.current) return;
    let active = true;
    setStatus("loading");
    const waveform = WaveSurfer.create({
      container: container.current,
      height: 22,
      waveColor: "#92d6aa",
      cursorWidth: 0,
      interact: false,
      autoScroll: false,
      autoCenter: false,
      barWidth: 2,
      barGap: 1,
      normalize: false,
      sampleRate: 8000,
    });
    waveform.on("ready", () => {
      if (active) setStatus("ready");
    });
    waveform.on("error", () => {
      if (active) setStatus("error");
    });
    void waveform.load(src).catch(() => {
      if (active) setStatus("error");
    });
    return () => {
      active = false;
      waveform.destroy();
    };
  }, [src]);
  return (
    <span className="audio-waveform" data-waveform-status={status} aria-hidden="true">
      <span ref={container} />
      {status !== "ready" && (
        <small>
          {translateUi(status === "error" ? "Waveform unavailable" : "Loading waveform…")}
        </small>
      )}
    </span>
  );
}
