import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Tooltip } from "antd";
import {
  Clapperboard,
  Film,
  LockKeyhole,
  Maximize2,
  Mic,
  Minus,
  Music2,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Sparkles,
  StepBack,
  StepForward,
} from "lucide-react";
import type { VideoGenerationJob } from "../../../shared/domains/video";
import { languageMediaUrls } from "../../lib/language-media";
import { roomCssVariables } from "../../theme";
import { productionDeskModel, type DeskClip } from "../../lib/production-desk";
import { playbackTime, pauseOtherPlayback } from "../../lib/video-playback";
import { useStoryboard } from "../../use-storyboard";
import { translateUi, useUiLanguage } from "../../i18n";
import { VideoPlayer } from "../video-player";
import { LoadingStatus } from "../loading-status";
import { AudioWaveform } from "../audio-waveform";
import { useArtifactJson } from "../../use-artifact-json";
import { ProductionSchema } from "../../../shared/agents/schemas/video";
import { NarrationStateSchema, narrationStatePath } from "../../../shared/narration";
import "./production-desk.css";

const trackIcons = { video: Film, narration: Mic, sfx: Sparkles, music: Music2 };
const statusLabels = { media: "Saved media reference", flattened: "Flattened", planned: "Planned" };
export function ProductionDesk({ projectId, job }: { projectId: string; job: VideoGenerationJob }) {
  useUiLanguage();
  const { storyboard, error: storyboardError, base } = useStoryboard(projectId, job.id);
  const { data: savedProduction } = useArtifactJson(`${base}/production.json`, ProductionSchema);
  const { data: savedNarration } = useArtifactJson(
    `${base}/${narrationStatePath}`,
    NarrationStateSchema,
  );
  const model = useMemo(
    () =>
      productionDeskModel(
        {
          ...job,
          production: savedProduction ?? job.production,
          speechTrack: savedNarration?.track ?? job.speechTrack,
        },
        storyboard,
      ),
    [job, savedProduction, savedNarration, storyboard],
  );
  const player = useRef<HTMLVideoElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const playheadInput = useRef<HTMLInputElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();
  const url = (file: string) => `${base}/${file.split("/").map(encodeURIComponent).join("/")}`;
  const languages = job.languageMedia ? languageMediaUrls(job.languageMedia, url) : undefined;
  const selected = model.tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.id === selectedId);
  const ticks = Array.from({ length: 11 }, (_, index) => (model.duration * index) / 10);
  const canPlay = Boolean(job.video) && !mediaError;
  const stoppedTime = playing ? undefined : time;
  useEffect(() => {
    const video = player.current;
    pauseOtherPlayback(video ?? undefined);
    return () => {
      video?.pause();
    };
  }, []);
  useEffect(() => {
    let frame: number | undefined;
    let previous = -1;
    const cursors = timeline.current?.querySelectorAll<HTMLElement>(".desk-playhead");
    const update = () => {
      const video = player.current;
      const current = video?.readyState ? video.currentTime : (stoppedTime ?? 0);
      if (current !== previous) {
        const position = Math.min(100, Math.max(0, (current / model.duration) * 100));
        for (const cursor of cursors ?? []) cursor.style.transform = `translateX(${position}%)`;
        if (playheadInput.current) playheadInput.current.value = String(current);
        previous = current;
      }
      if (playing) frame = requestAnimationFrame(update);
    };
    update();
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [playing, stoppedTime, model.duration]);
  function seek(value: number) {
    const video = player.current;
    const end =
      video && Number.isFinite(video.duration)
        ? Math.min(model.duration, video.duration)
        : model.duration;
    const next = Math.min(end, Math.max(0, value));
    setTime(next);
    if (video && video.readyState > 0) video.currentTime = next;
  }
  function jump(direction: -1 | 1) {
    const starts = [0, ...model.tracks[0].clips.map((clip) => clip.start), model.duration];
    const current = player.current?.currentTime ?? time;
    const next =
      direction < 0
        ? (starts.filter((start) => start < current - 0.05).at(-1) ?? 0)
        : (starts.find((start) => start > current + 0.05) ?? model.duration);
    seek(next);
  }
  async function toggle() {
    const video = player.current;
    if (!video || !canPlay) return;
    if (!video.paused) video.pause();
    else
      try {
        await video.play();
      } catch {
        setMediaError(true);
      }
  }
  function select(clip: DeskClip) {
    setSelectedId(clip.id);
  }
  function iconButton(label: string, icon: React.ReactNode, action: () => void, disabled = false) {
    return (
      <Tooltip title={translateUi(label)} trigger={["hover", "focus"]}>
        <Button
          aria-label={translateUi(label)}
          type="text"
          icon={icon}
          onClick={action}
          disabled={disabled}
        />
      </Tooltip>
    );
  }
  return (
    <section
      className="production-desk"
      style={roomCssVariables}
      aria-label={translateUi("Production Desk")}
    >
      <header className="desk-heading">
        <div>
          <Clapperboard size={18} aria-hidden="true" />
          <h2>{model.title}</h2>
        </div>
        <span className="desk-readonly">
          <LockKeyhole size={12} aria-hidden="true" />
          {translateUi("Read only")}
        </span>
      </header>
      <div className="desk-preview-layout">
        <div className="desk-preview">
          {job.video ? (
            <VideoPlayer
              ref={player}
              src={url(job.video)}
              languageMedia={languages}
              preload="metadata"
              aria-label={translateUi("Desk preview")}
              onLoadedMetadata={() => {
                if (time > 0) seek(time);
              }}
              onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
              onSeeked={(event) => setTime(event.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onError={() => {
                setMediaError(true);
                setPlaying(false);
              }}
            />
          ) : (
            <p>{translateUi("No rendered video yet.")}</p>
          )}
        </div>
        <aside className="desk-inspector" aria-label={translateUi("Clip inspector")}>
          {selected ? (
            <>
              <span className={`desk-status desk-status-${selected.status}`}>
                {translateUi(statusLabels[selected.status])}
              </span>
              <h3>{selected.label}</h3>
              <dl>
                <dt>{translateUi("Start")}</dt>
                <dd>{selected.start.toFixed(2)}s</dd>
                <dt>{translateUi("End")}</dt>
                <dd>{selected.end.toFixed(2)}s</dd>
                <dt>{translateUi("Timing")}</dt>
                <dd>{translateUi(selected.timing)}</dd>
              </dl>
              {selected.source && (
                <>
                  <h4>{translateUi("Source")}</h4>
                  <code>{selected.source}</code>
                </>
              )}
            </>
          ) : (
            <p>{translateUi("Select a clip to inspect its saved timing and source.")}</p>
          )}
        </aside>
      </div>
      {mediaError && (
        <Alert
          type="warning"
          showIcon
          title={translateUi(
            "Rendered video could not load. The saved timeline remains available.",
          )}
        />
      )}
      <div className="desk-transport" role="group" aria-label={translateUi("Playback controls")}>
        <div className="desk-transport-buttons">
          {iconButton("Go to start", <SkipBack size={16} />, () => seek(0))}
          {iconButton("Previous scene", <StepBack size={16} />, () => jump(-1))}
          {iconButton(
            playing ? "Pause movie" : "Play movie",
            playing ? <Pause size={18} /> : <Play size={18} />,
            () => void toggle(),
            !canPlay,
          )}
          {iconButton("Next scene", <StepForward size={16} />, () => jump(1))}
          {iconButton("Go to end", <SkipForward size={16} />, () => seek(model.duration))}
        </div>
        <output aria-label={translateUi("Desk time")}>
          {playbackTime(time)} <span>/ {playbackTime(model.duration)}</span>
        </output>
        <div className="desk-zoom">
          {iconButton(
            "Zoom out",
            <Minus size={15} />,
            () => setZoom((value) => Math.max(1, value - 1)),
            zoom === 1,
          )}
          <span>{zoom}×</span>
          {iconButton(
            "Zoom in",
            <Plus size={15} />,
            () => setZoom((value) => Math.min(6, value + 1)),
            zoom === 6,
          )}
          {iconButton("Fit timeline", <Maximize2 size={15} />, () => setZoom(1))}
        </div>
      </div>
      <div className="desk-timeline-scroll" aria-label={translateUi("Production timeline")}>
        <div className="desk-timeline" ref={timeline} style={{ minWidth: `${zoom * 100}%` }}>
          <div className="desk-row desk-ruler-row">
            <div className="desk-track-heading">
              <LockKeyhole size={12} />
              {translateUi("Tracks")}
            </div>
            <div className="desk-ruler">
              <div className="desk-ticks" aria-hidden="true">
                {ticks.map((tick, index) => (
                  <span key={index} style={{ left: `${index * 10}%` }}>
                    {model.duration < 10 ? `${tick.toFixed(1)}s` : playbackTime(tick)}
                  </span>
                ))}
              </div>
              <input
                ref={playheadInput}
                type="range"
                min={0}
                max={model.duration}
                step={0.01}
                value={Math.min(time, model.duration)}
                aria-label={translateUi("Desk playhead")}
                aria-valuetext={playbackTime(time)}
                onChange={(event) => seek(Number(event.target.value))}
              />
              <span className="desk-playhead" aria-hidden="true" />
            </div>
          </div>
          {model.tracks.map((track) => {
            const Icon = trackIcons[track.id];
            return (
              <div
                className={`desk-row desk-track desk-track-${track.id}`}
                key={track.id}
                role="group"
                aria-label={translateUi(track.label)}
              >
                <div className="desk-track-heading">
                  <Icon size={15} aria-hidden="true" />
                  <span>{translateUi(track.label)}</span>
                  <Tooltip title={translateUi(track.note)}>
                    <span className="desk-track-count">{track.clips.length}</span>
                  </Tooltip>
                </div>
                <div className="desk-lane">
                  {!track.clips.length && (
                    <span className="desk-empty">
                      {translateUi("No saved clips in this track.")}
                    </span>
                  )}
                  {track.clips.map((clip) => (
                    <button
                      key={clip.id}
                      type="button"
                      draggable={false}
                      className={`desk-clip desk-clip-${clip.status}${selectedId === clip.id ? " is-selected" : ""}`}
                      style={{
                        left: `${(clip.start / model.duration) * 100}%`,
                        width: `${((clip.end - clip.start) / model.duration) * 100}%`,
                      }}
                      aria-pressed={selectedId === clip.id}
                      aria-label={`${translateUi(track.label)}: ${clip.label}; ${clip.start.toFixed(2)}–${clip.end.toFixed(2)}s; ${translateUi(statusLabels[clip.status])}`}
                      title={`${clip.label}\n${translateUi(statusLabels[clip.status])}\n${translateUi(clip.timing)}`}
                      onClick={() => select(clip)}
                      onDoubleClick={() => seek(clip.start)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          select(clip);
                          seek(clip.start);
                        }
                      }}
                    >
                      <span>{clip.label}</span>
                      {(track.id === "music" || track.id === "sfx") && clip.source ? (
                        <AudioWaveform src={url(clip.source)} />
                      ) : (
                        <small>{translateUi(statusLabels[clip.status])}</small>
                      )}
                    </button>
                  ))}
                  <span className="desk-playhead" aria-hidden="true" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="desk-caption">
        {translateUi(
          "Preview plays the delivered mix. Tracks below are an inspection view; they do not remix audio.",
        )}
      </p>
      <details className="desk-notes">
        <summary>{translateUi("Track details")}</summary>
        <ul>
          {model.tracks.map((track) => (
            <li key={track.id}>
              <strong>{translateUi(track.label)}:</strong> {translateUi(track.note)}
            </li>
          ))}
          {(job.languageMedia?.narration.length ?? 0) > 1 && (
            <li>{translateUi("Narration cues describe the primary saved track.")}</li>
          )}
          {model.omitted > 0 && (
            <li>{translateUi("Some saved cues have no valid timing and were omitted.")}</li>
          )}
          {storyboardError && (
            <li>
              {translateUi(
                "Storyboard could not be loaded. Showing available production metadata.",
              )}
            </li>
          )}
        </ul>
      </details>
      {!storyboard && !storyboardError && (
        <LoadingStatus text={translateUi("Loading storyboard details…")} />
      )}
    </section>
  );
}
