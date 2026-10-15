import type { MangaStoryboard } from "./storyboard-model";
export function storyboardMovieCues(storyboard: MangaStoryboard) {
  return storyboard.scenes
    .flatMap((scene, sceneIndex) =>
      scene.beats.flatMap((beat, beatIndex) => {
        const start = beat.startSeconds ?? scene.startSeconds;
        const end = beat.endSeconds ?? scene.beats[beatIndex + 1]?.startSeconds ?? scene.endSeconds;
        if (
          start === undefined ||
          end === undefined ||
          end <= start ||
          start >= storyboard.durationSeconds
        )
          return [];
        return [
          {
            scene,
            sceneIndex,
            beat,
            beatIndex,
            start,
            end: Math.min(end, storyboard.durationSeconds),
          },
        ];
      }),
    )
    .sort((a, b) => a.start - b.start);
}
export type StoryboardMovieCue = ReturnType<typeof storyboardMovieCues>[number];
export function storyboardCueMotion(development: string) {
  const text = development.toLowerCase();
  return {
    slide: /\b(?:slide|slides|sliding|pan|pans|rushes|moves|move|dolly)\b/.test(text),
    fall: /\b(?:drop|drops|lands|land|fall|falls)\b/.test(text),
    reveal: /\b(?:reveal|reveals|revealing|wipe|wipes|opens|unfolds|draws)\b/.test(text),
    zoom: /\b(?:zoom|zooms|push-in|push in|close-up)\b/.test(text),
    impact: /\b(?:slams|snaps|bursts|impact)\b/.test(text),
    camera: /\bcamera\b.*\b(?:moves|turns|push|dolly|pans)\b/.test(text),
  };
}

export function storyboardCueAt(
  cues: readonly StoryboardMovieCue[],
  position: number,
  duration: number,
) {
  return cues
    .filter(
      (entry) =>
        entry.start <= position &&
        (position < entry.end || (position === duration && entry.end === duration)),
    )
    .at(-1);
}

export function storyboardBubble(development: string) {
  const motion = storyboardCueMotion(development);
  const kind = motion.impact
    ? "burst"
    : /\b(?:hold|reading|pause|quiet|wait)\b/i.test(development)
      ? "thought"
      : motion.reveal
        ? "caption"
        : "speech";
  const firstSentence =
    [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(development)][0]?.segment ||
    development;
  const mainClause = firstSentence.split(/[;(]/)[0].trim();
  const words = [...new Intl.Segmenter("en", { granularity: "word" }).segment(mainClause)];
  let text = "";
  for (const word of words) {
    if ((text + word.segment).length > 100) break;
    text += word.segment;
  }
  text = text.trim();
  return { kind, text: text.length < mainClause.length ? `${text}…` : text };
}

export function storyboardSceneTransition(
  cues: readonly StoryboardMovieCue[],
  position: number,
  duration: number,
) {
  const current = storyboardCueAt(cues, position, duration);
  if (!current) return undefined;
  const first = cues.find((entry) => entry.sceneIndex === current.sceneIndex)!;
  const previous = cues
    .filter((entry) => entry.sceneIndex !== current.sceneIndex && entry.start < first.start)
    .at(-1);
  if (!previous) return undefined;
  const transitionDuration = Math.min(0.9, first.end - first.start);
  const progress = (position - first.start) / transitionDuration;
  return progress >= 0 && progress < 1 ? { previous, progress } : undefined;
}

export function storyboardSceneTitle(
  cues: readonly StoryboardMovieCue[],
  position: number,
  duration: number,
) {
  const current = storyboardCueAt(cues, position, duration);
  if (!current || current.sceneIndex !== cues[0]?.sceneIndex) return undefined;
  const sceneCues = cues.filter((entry) => entry.sceneIndex === current.sceneIndex);
  const start = sceneCues[0].start;
  const end = Math.max(...sceneCues.map((entry) => entry.end));
  const titleDuration = Math.min(3, (end - start) * 0.35);
  const elapsed = position - start;
  if (elapsed < 0 || elapsed >= titleDuration) return undefined;
  return {
    sceneIndex: current.sceneIndex,
    title: current.scene.title,
    elapsed,
    duration: titleDuration,
    opacity: Math.min(1, (titleDuration - elapsed) / Math.min(0.3, titleDuration / 3)),
  };
}

export function storyboardTitleGlyph(
  index: number,
  count: number,
  elapsed: number,
  duration: number,
) {
  const buildDuration = Math.min(1.3, duration * 0.55);
  const arrivalDuration = buildDuration * 0.32;
  const stagger = (buildDuration - arrivalDuration) / Math.max(1, count - 1);
  const progress = Math.max(0, Math.min(1, (elapsed - index * stagger) / arrivalDuration));
  const remaining = (1 - progress) ** 3;
  return {
    opacity: Math.min(1, progress * 5),
    scale: 1 + remaining * 1.4,
    x: remaining * 18,
    blur: remaining * 5,
    echo: remaining * 8,
  };
}

export function storyboardTitleWave(index: number, elapsed: number, duration: number) {
  // A visual 90 BPM pulse, phased across glyphs; no inferred soundtrack synchronization.
  const beatSeconds = 60 / 90;
  const phase = (elapsed - index * 0.055) / beatSeconds;
  const pulse = Math.max(0, Math.sin(phase * Math.PI * 2)) ** 2;
  const envelope = Math.max(0, Math.min(1, elapsed / 0.2, (duration - elapsed) / 0.5));
  return { y: -9 * pulse * envelope, scale: 1 + 0.055 * pulse * envelope };
}

export function storyboardCrewReactions(cue: StoryboardMovieCue | undefined, position: number) {
  const motion = storyboardCueMotion(cue?.beat.development ?? "");
  const active = !!cue && position >= cue.start && position < Math.min(cue.end, cue.start + 0.65);
  return {
    director: active && motion.impact,
    stage: active && (motion.reveal || motion.fall),
    camera: active && motion.camera,
  };
}

export function storyboardDirectorDialogue(
  cues: readonly StoryboardMovieCue[],
  position: number,
  duration: number,
) {
  const cue = storyboardCueAt(cues, position, duration);
  if (!cue) return { visible: false, bodyTilt: 0, reaction: false };
  let index = cues.indexOf(cue);
  const text = storyboardBubble(cue.beat.development).text;
  while (
    index > 0 &&
    cues[index - 1].end === cues[index].start &&
    storyboardBubble(cues[index - 1].beat.development).text === text
  )
    index--;
  const elapsed = position - cues[index].start;
  const readingSeconds = Math.min(4, Math.max(1.8, text.length / 28));
  const visible = text.length > 0 && elapsed >= 0 && elapsed < readingSeconds;
  const gestureSeconds = 0.8;
  const bodyTilt =
    visible && elapsed < gestureSeconds
      ? Math.sin((elapsed / gestureSeconds) * Math.PI * 4) * 6 * (1 - elapsed / gestureSeconds)
      : 0;
  return { visible, bodyTilt, reaction: visible && elapsed < 0.65 };
}
