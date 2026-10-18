import { translateUi, useUiLanguage } from "./i18n";
import {
  storyboardCrewPlan,
  storyboardCrewState,
  type CrewPlan,
  type CrewRole,
} from "./storyboard-crew-plan";
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { Button } from "antd";
import { storyboardAssetPath, storyboardTime, type MangaStoryboard } from "./storyboard-model";
import {
  storyboardMovieCues,
  storyboardCueMotion,
  storyboardCueAt,
  storyboardBubble,
  storyboardSceneTransition,
  storyboardSceneTitle,
  storyboardTitleGlyph,
  storyboardTitleWave,
  storyboardDirectorDialogue,
  type StoryboardMovieCue,
} from "./storyboard-movie";
import { StoryboardCrew, storyboardCrewLabels } from "./storyboard-crew";

function MovieSet({
  cue,
  base,
  title,
}: {
  cue: StoryboardMovieCue | undefined;
  base: string;
  title: string;
}) {
  useUiLanguage();
  const scene = cue?.scene;
  const asset = scene?.assets.map(storyboardAssetPath).find(Boolean);
  return (
    <>
      <div className="movie-speed-lines" />
      <div className="movie-board-shadow">
        <div className="movie-prop">
          <span className="movie-prop-label">{scene?.title || title}</span>
          {asset ? (
            <img src={`${base}/${asset}`} alt={translateUi("Current scene reference")} />
          ) : (
            <div className="movie-paper">
              <span>✦</span>
              <p>{scene?.purpose || translateUi("Set ready")}</p>
            </div>
          )}
          <div className="movie-caption">
            {cue?.beat.captions.map((caption, i) => (
              <p key={i}>{caption}</p>
            ))}
          </div>
        </div>
      </div>
      <div className="movie-floor" />
    </>
  );
}

function MovieCrew({
  cue,
  position,
  dialogue,
  crewPlan,
}: {
  cue: StoryboardMovieCue | undefined;
  position: number;
  dialogue: ReturnType<typeof storyboardDirectorDialogue>;
  crewPlan: CrewPlan;
}) {
  useUiLanguage();
  const bubble = storyboardBubble(cue?.beat.development || "Waiting for the next recorded cue.");
  return (
    <>
      <div className="movie-crew-layer">
        <div className="movie-director">
          <StoryboardCrew
            role="director"
            reaction={dialogue.reaction}
            bodyTilt={dialogue.bodyTilt}
          />
          <b>{translateUi(storyboardCrewLabels.director.name)}</b>
        </div>
        {(["stage", "lighting", "art", "sound", "camera"] as CrewRole[])
          .filter((role) => role === "stage" || role === "camera" || crewPlan[role].length > 0)
          .map((role) => {
            const state = storyboardCrewState(crewPlan, role, position);
            return (
              <div
                key={role}
                className={`movie-worker movie-worker-${role} ${role === "stage" ? "movie-runner" : role === "camera" ? "movie-camera" : ""}`}
                data-role={role}
                data-phase={state.phase}
                title={state.source || undefined}
                style={{ left: `${state.x}%` }}
              >
                <div
                  className="movie-worker-movement"
                  style={{ transform: `translateY(${state.bounce}px) rotate(${state.tilt}deg)` }}
                >
                  <div
                    className="movie-worker-facing"
                    style={{ transform: `scaleX(${state.facing})` }}
                  >
                    <StoryboardCrew role={role} reaction={state.working && role !== "camera"} />
                  </div>
                  <i className="movie-worker-dust" aria-hidden="true" />
                </div>
                <b>{translateUi(storyboardCrewLabels[role].name)}</b>
                <span className="movie-worker-task">{translateUi(state.action)}</span>
              </div>
            );
          })}
      </div>
      <div
        className={`movie-speech movie-speech-${bubble.kind}`}
        data-copy-length={
          bubble.text.length <= 45 ? "short" : bubble.text.length <= 80 ? "medium" : "long"
        }
        title={cue?.beat.development}
        data-speaking={dialogue.reaction}
      >
        <div className="movie-speech-content">
          <strong>
            {cue
              ? translateUi("{{value0}} · ACTION", { value0: storyboardTime(cue.start) })
              : translateUi("HOLD")}
          </strong>
          <p>{bubble.text}</p>
        </div>
      </div>
    </>
  );
}

export function StoryboardMovie({
  storyboard,
  base,
}: {
  storyboard: MangaStoryboard;
  base: string;
}) {
  useUiLanguage();
  const root = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(true);
  const cues = useMemo(() => storyboardMovieCues(storyboard), [storyboard]);
  const crewPlan = useMemo(() => storyboardCrewPlan(cues), [cues]);
  const cue = storyboardCueAt(cues, position, storyboard.durationSeconds);
  const scene = cue?.scene;
  const dialogue = storyboardDirectorDialogue(cues, position, storyboard.durationSeconds);
  const transition = storyboardSceneTransition(cues, position, storyboard.durationSeconds);
  const sceneTitle = storyboardSceneTitle(cues, position, storyboard.durationSeconds);
  const transitionProgress = transition ? gsap.parseEase("power2.inOut")(transition.progress) : 1;

  useEffect(() => {
    if (!root.current || !cues.length) return;
    setPlaying(true);
    const clock = { time: 0 };
    const context = gsap.context(() => {
      const sequence = gsap.timeline({
        paused: true,
        defaults: { immediateRender: false },
        onUpdate: () => setPosition(clock.time),
        onComplete: () => setPlaying(false),
      });
      sequence.to(
        clock,
        { time: storyboard.durationSeconds, duration: storyboard.durationSeconds, ease: "none" },
        0,
      );
      for (const entry of cues) {
        const motion = storyboardCueMotion(entry.beat.development);
        const duration = Math.min(0.8, (entry.end - entry.start) * 0.65);
        sequence.set(
          ".movie-current-pane .movie-prop",
          { x: 0, y: 0, scale: 1, rotation: 0, clipPath: "inset(0 0 0% 0)" },
          entry.start,
        );
        sequence.fromTo(
          ".movie-crew-layer .movie-director .manga-clapper > i",
          { rotation: -28 },
          { rotation: 0, duration: Math.min(0.2, duration), yoyo: true, repeat: 1 },
          entry.start,
        );
        sequence.fromTo(
          ".movie-crew-layer .movie-director .manga-head",
          { rotation: -4 },
          {
            rotation: 5,
            duration: duration / 2,
            yoyo: true,
            repeat: 1,
            transformOrigin: "50% 90%",
          },
          entry.start,
        );
        if (motion.slide || motion.impact) {
          sequence.fromTo(
            ".movie-current-pane .movie-prop",
            { x: motion.impact ? 90 : 130 },
            { x: 0, duration, ease: motion.impact ? "power4.out" : "power2.inOut" },
            entry.start,
          );
        }
        if (motion.fall)
          sequence.fromTo(
            ".movie-current-pane .movie-prop",
            { y: -80 },
            { y: 0, duration, ease: "power2.out" },
            entry.start,
          );
        if (motion.reveal)
          sequence.fromTo(
            ".movie-current-pane .movie-prop",
            { clipPath: "inset(0 100% 0 0)" },
            { clipPath: "inset(0 0% 0 0)", duration, ease: "power2.inOut" },
            entry.start,
          );
        if (motion.zoom)
          sequence.fromTo(
            ".movie-current-pane .movie-prop",
            { scale: 1 },
            { scale: 1.1, duration: entry.end - entry.start, ease: "none" },
            entry.start,
          );
        if (motion.camera) {
          sequence.fromTo(
            ".movie-crew-layer .movie-camera .manga-camera-prop",
            { rotation: 0 },
            { rotation: -5, duration: duration / 2, yoyo: true, repeat: 1 },
            entry.start,
          );
        }
      }
      timeline.current = sequence;
      sequence.play();
    }, root);
    return () => {
      context.revert();
      timeline.current = null;
    };
  }, [cues, storyboard.durationSeconds]);
  function seek(value: number) {
    timeline.current?.pause().time(value, false);
    setPosition(value);
    setPlaying(false);
  }
  function toggle() {
    const sequence = timeline.current;
    if (!sequence) return;
    if (playing) {
      sequence.pause();
      setPlaying(false);
    } else {
      if (sequence.progress() === 1) sequence.time(0);
      sequence.play();
      setPlaying(true);
    }
  }
  if (!cues.length) return <p>{translateUi("No timed beats are recorded for movie playback.")}</p>;
  return (
    <div className="manga-movie" ref={root}>
      <div className="movie-heading">
        <strong>
          {translateUi("ON SET ·")}{" "}
          {scene
            ? translateUi("SCENE {{value0}}", {
                value0: String((cue?.sceneIndex ?? 0) + 1).padStart(2, "0"),
              })
            : translateUi("BETWEEN CUES")}
        </strong>
        <span>
          {storyboardTime(position)} / {storyboardTime(storyboard.durationSeconds)}
        </span>
      </div>
      <div className="movie-stage" aria-label={translateUi("Animated manga rehearsal")}>
        {transition && (
          <div
            className="movie-scene-pane movie-previous-pane"
            aria-hidden="true"
            style={{ transform: `translateX(${-transitionProgress * 100}%)` }}
          >
            <MovieSet cue={transition.previous} base={base} title={storyboard.title} />
          </div>
        )}
        <div
          className="movie-scene-pane movie-current-pane"
          style={{ transform: `translateX(${(1 - transitionProgress) * 100}%)` }}
        >
          <MovieSet cue={cue} base={base} title={storyboard.title} />
        </div>
        <MovieCrew cue={cue} position={position} dialogue={dialogue} crewPlan={crewPlan} />
        {sceneTitle && (
          <div
            className="movie-scene-title"
            style={{ opacity: sceneTitle.opacity }}
            aria-label={translateUi("Scene introduction")}
          >
            <span>{translateUi("HOW IT’S MADE")}</span>
            <strong>{translateUi("THE DIRECTOR’S NOTEBOOK")}</strong>
            <h2 aria-label={sceneTitle.title}>
              {[
                ...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(sceneTitle.title),
              ].map((glyph, index, glyphs) => {
                const motion = storyboardTitleGlyph(
                  index,
                  glyphs.length,
                  sceneTitle.elapsed,
                  sceneTitle.duration,
                );
                const wave = storyboardTitleWave(index, sceneTitle.elapsed, sceneTitle.duration);
                return (
                  <span
                    key={glyph.index}
                    aria-hidden="true"
                    className="movie-title-glyph"
                    style={{
                      opacity: motion.opacity,
                      transform: `translate(${motion.x}px, ${wave.y}px) scale(${motion.scale * wave.scale})`,
                      filter: `blur(${motion.blur}px)`,
                      textShadow:
                        motion.echo > 0.1
                          ? `${-motion.echo}px 0 #f16b54, ${motion.echo}px 0 #57bdb0`
                          : "none",
                    }}
                  >
                    {glyph.segment}
                  </span>
                );
              })}
            </h2>
            <p>{translateUi("Behind the scenes")}</p>
          </div>
        )}
      </div>
      <div className="movie-controls">
        <Button onClick={toggle}>
          {playing ? translateUi("Pause movie") : translateUi("Play movie")}
        </Button>
        <Button
          onClick={() => {
            timeline.current?.restart();
            setPlaying(true);
          }}
        >
          {translateUi("Replay")}
        </Button>
        <input
          type="range"
          aria-label={translateUi("Movie time")}
          min={0}
          max={storyboard.durationSeconds}
          step={0.1}
          value={position}
          style={{
            backgroundImage: `linear-gradient(to right, var(--manga-accent) ${Math.min(100, Math.max(0, (position / storyboard.durationSeconds) * 100))}%, #d5d5d5 0%)`,
          }}
          onChange={(event) => seek(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
