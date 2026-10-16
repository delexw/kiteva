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
import { playbackTime } from "../lib/video-playback";
import "./video-player.css";

type VideoPlayerProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "controls"> & {
  ref?: Ref<HTMLVideoElement>;
};

export function VideoPlayer({ ref, src, ...props }: VideoPlayerProps) {
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
        setError("This video could not play. Please try again.");
      }
    }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === frame.current) await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    } catch {
      setError("Fullscreen is unavailable. You can keep watching here.");
    }
  }
  return (
    <div className="kiteva-video-player" ref={frame} role="group" aria-label={`${label} player`}>
      <video
        {...props}
        src={src}
        ref={player}
        controls={false}
        onLoadedMetadata={(event) => {
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
          sync();
          props.onVolumeChange?.(event);
        }}
        onError={(event) => {
          setError("This video could not load. Please try again.");
          props.onError?.(event);
        }}
      />
      <div className="kiteva-playback-bar" role="toolbar" aria-label="Video playback controls">
        <Button
          type="text"
          aria-label={playing ? "Pause video" : "Play video"}
          title={playing ? "Pause" : "Play"}
          icon={playing ? <Pause size={18} /> : <Play size={18} />}
          onClick={() => void togglePlayback()}
        />
        <span className="kiteva-playback-time" aria-label="Playback time">
          {playbackTime(time)} / {playbackTime(duration)}
        </span>
        <Slider
          className="kiteva-playback-seek"
          aria-label="Seek video"
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
          content={
            <Slider
              aria-label="Video volume"
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
            aria-label={muted || volume === 0 ? "Unmute video" : "Mute video"}
            title="Volume"
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
          aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title="Fullscreen"
          icon={fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
          onClick={() => void toggleFullscreen()}
        />
      </div>
      {error && (
        <div className="kiteva-playback-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
