import { videoLanguageLabel } from "../../shared/video-language";
import { useVideoLanguageTracks } from "../use-video-language-tracks";
import { LanguagePlaybackControls } from "./language-playback-controls";
import type { LanguageMedia } from "../../shared/language-tracks";
import { translateUi, useUiLanguage } from "../i18n";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type VideoHTMLAttributes,
} from "react";
import { Button, Popover, Slider } from "antd";
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { playbackTime, pauseOtherPlayback } from "../lib/video-playback";
import "./video-player.css";

type VideoPlayerProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "controls"> & {
  ref?: Ref<HTMLVideoElement>;
  languageMedia?: LanguageMedia;
};

export function VideoPlayer({ ref, src, languageMedia, ...props }: VideoPlayerProps) {
  useUiLanguage();
  const player = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => player.current!, []);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(Boolean(props.muted));
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [error, setError] = useState("");
  const languages = useVideoLanguageTracks(player, src, languageMedia);
  const label = props["aria-label"] || "Video";
  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setError("");
  }, [src]);
  useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const update = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  function sync() {
    const video = player.current;
    if (!video) return;
    setPlaying(!video.paused && !video.ended);
    setTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    setDuration(Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0);
    setVolume(video.volume);
    setMuted(video.muted);
  }
  async function togglePlayback() {
    const video = player.current;
    if (!video) return;
    setError("");
    if (!video.paused) video.pause();
    else {
      try {
        await video.play();
      } catch {
        setError(translateUi("This video could not play. Please try again."));
      }
    }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === frame.current) await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    } catch {
      setError(translateUi("Fullscreen is unavailable. You can keep watching here."));
    }
  }
  return (
    <div
      className="kiteva-video-player"
      ref={frame}
      role="group"
      aria-label={translateUi("{{value0}} player", { value0: label })}
    >
      <video
        {...props}
        src={languages.playbackSource}
        ref={player}
        controls={false}
        onLoadedMetadata={(event) => {
          const restored = languages.restorePlayback(event.currentTarget);
          if (restored)
            void restored.catch(() =>
              setError(translateUi("This video could not play. Please try again.")),
            );
          sync();
          props.onLoadedMetadata?.(event);
        }}
        onDurationChange={(event) => {
          sync();
          props.onDurationChange?.(event);
        }}
        onTimeUpdate={(event) => {
          sync();
          props.onTimeUpdate?.(event);
        }}
        onPlay={(event) => {
          if (!event.currentTarget.muted) pauseOtherPlayback(event.currentTarget);
          sync();
          props.onPlay?.(event);
        }}
        onPause={(event) => {
          sync();
          props.onPause?.(event);
        }}
        onEnded={(event) => {
          sync();
          props.onEnded?.(event);
        }}
        onVolumeChange={(event) => {
          if (!event.currentTarget.paused && !event.currentTarget.muted)
            pauseOtherPlayback(event.currentTarget);
          sync();
          props.onVolumeChange?.(event);
        }}
        onError={(event) => {
          setError(translateUi("This video could not load. Please try again."));
          props.onError?.(event);
        }}
      >
        {props.children}
        {languageMedia?.subtitles.map((track) => (
          <track
            key={track.language}
            kind="subtitles"
            src={track.vtt}
            srcLang={track.language}
            label={videoLanguageLabel(track.language)}
            onLoad={() => languages.selectSubtitles(languages.subtitleLanguage)}
          />
        ))}
      </video>
      <div className="kiteva-playback-overlay">
        {languageMedia && (
          <LanguagePlaybackControls
            media={languageMedia}
            audioLanguage={languages.audioLanguage}
            subtitleLanguage={languages.subtitleLanguage}
            onAudioChange={languages.changeAudioLanguage}
            onSubtitleChange={languages.changeSubtitleLanguage}
          />
        )}
        <div
          className="kiteva-playback-bar"
          role="toolbar"
          aria-label={translateUi("Video playback controls")}
        >
          <Button
            type="text"
            aria-label={playing ? translateUi("Pause video") : translateUi("Play video")}
            title={playing ? translateUi("Pause") : translateUi("Play")}
            icon={playing ? <Pause size={18} /> : <Play size={18} />}
            onClick={() => void togglePlayback()}
          />
          <span className="kiteva-playback-time" aria-label={translateUi("Playback time")}>
            {playbackTime(time)} / {playbackTime(duration)}
          </span>
          <Slider
            className="kiteva-playback-seek"
            aria-label={translateUi("Seek video")}
            ariaLabelForHandle="Seek video"
            min={0}
            max={duration || 1}
            step={0.1}
            value={time}
            disabled={!duration}
            tooltip={{ formatter: (value) => playbackTime(value || 0) }}
            onChange={(value) => {
              if (player.current) {
                player.current.currentTime = value;
                setTime(value);
              }
            }}
          />
          <Popover
            trigger={["hover", "click"]}
            placement="top"
            getPopupContainer={(trigger) => trigger.parentElement!}
            content={
              <Slider
                aria-label={translateUi("Video volume")}
                ariaLabelForHandle="Video volume"
                style={{ width: 110 }}
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(value) => {
                  if (player.current) {
                    player.current.volume = value;
                    player.current.muted = value === 0;
                    sync();
                  }
                }}
              />
            }
          >
            <Button
              type="text"
              aria-label={
                muted || volume === 0 ? translateUi("Unmute video") : translateUi("Mute video")
              }
              title={translateUi("Volume")}
              icon={muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              onClick={() => {
                if (player.current) {
                  player.current.muted = !player.current.muted;
                  if (player.current.volume === 0) player.current.volume = 1;
                  sync();
                }
              }}
            />
          </Popover>
          <Button
            type="text"
            disabled={!canFullscreen}
            aria-label={
              fullscreen ? translateUi("Exit fullscreen") : translateUi("Enter fullscreen")
            }
            title={translateUi("Fullscreen")}
            icon={fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
            onClick={() => void toggleFullscreen()}
          />
        </div>
      </div>
      {error && (
        <div className="kiteva-playback-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
