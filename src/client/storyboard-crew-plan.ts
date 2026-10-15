import type { StoryboardMovieCue } from "./storyboard-movie";

export type CrewRole = "stage" | "camera" | "lighting" | "art" | "sound";
export interface CrewTask {
  start: number;
  end: number;
  action: string;
  source: string;
  target: number;
}
export type CrewPlan = Record<CrewRole, CrewTask[]>;
const homes: Record<CrewRole, number> = { stage: 30, camera: 88, lighting: 65, art: 43, sound: 74 };

// A rehearsal interpretation of the recorded cues, never a claim about real production crew.
export function storyboardCrewPlan(cues: readonly StoryboardMovieCue[]): CrewPlan {
  const plan: CrewPlan = { stage: [], camera: [], lighting: [], art: [], sound: [] };
  for (const cue of cues) {
    const text = cue.beat.development;
    const sceneVisuals = cue.scene.visuals.join(" ");
    const task = (role: CrewRole, action: string, target: number) => {
      plan[role].push({ start: cue.start, end: cue.end, action, source: text, target });
    };
    if (
      (cue.beatIndex === 0 && cue.scene.assets.length > 0) ||
      /\b(?:prop|card|photo|plate|frame|thumbnail|assemble|slots?|montage|gallery|reveal|wipe)\b/i.test(
        text,
      )
    )
      task("stage", "Set the prop", 42);
    if (
      /\b(?:light|lighting|spotlight|shadow|flash|glow|lit)\b/i.test(text) ||
      (cue.beatIndex === 0 && /\b(?:light|lighting|shadow|spotlight)\b/i.test(sceneVisuals))
    )
      task("lighting", "Aim the light", 63);
    if (
      cue.beat.captions.length > 0 ||
      /\b(?:text|title|letter|ink|draw|draws|typeset|caption|print|pressed)\b/i.test(text)
    )
      task("art", "Set the lettering", 53);
    const sound = [...cue.beat.audio.effects, ...cue.beat.audio.music].join(" ");
    if (
      cue.beat.audio.effects.length > 0 ||
      /\b(?:impact|drop|dropout|build|riser|fade|crash|snare roll|hit|pulse)\b/i.test(sound)
    )
      task("sound", "Cue the sound", 79);
    if (
      /\b(?:camera|push|pushes|zoom|zooms|pan|pans|dolly|tracking|glide|glides|orbit)\b/i.test(text)
    )
      task("camera", "Track the shot", 82);
  }
  return plan;
}

export function storyboardCrewState(plan: CrewPlan, role: CrewRole, position: number) {
  const task = plan[role].find((entry) => position >= entry.start && position < entry.end);
  const home = homes[role];
  if (!task)
    return {
      x: home,
      bounce: 0,
      tilt: 0,
      facing: 1,
      phase: "ready",
      action: "Ready",
      source: "",
      working: false,
    };
  // Finish the trip within the cue, then leave the remainder still for reading.
  const activeDuration = Math.min(4, task.end - task.start);
  const elapsed = position - task.start;
  if (elapsed >= activeDuration)
    return {
      x: home,
      bounce: 0,
      tilt: 0,
      facing: 1,
      phase: "ready",
      action: "Ready",
      source: task.source,
      working: false,
    };
  const progress = elapsed / activeDuration;
  const phase = progress < 0.28 ? "arriving" : progress < 0.68 ? "working" : "returning";
  const travel =
    phase === "arriving" ? progress / 0.28 : phase === "working" ? 1 : (1 - progress) / 0.32;
  const eased = travel * travel * (3 - 2 * travel);
  const moving = phase !== "working";
  const stride = Math.sin(elapsed * Math.PI * 7);
  return {
    x: home + (task.target - home) * eased,
    bounce: moving
      ? -Math.abs(stride) * 4 * Math.sin(Math.PI * travel)
      : -Math.abs(Math.sin(((progress - 0.28) / 0.4) * Math.PI * 2)) * 2,
    tilt: moving
      ? (phase === "arriving" ? -1 : 1) * 7 * Math.sin(Math.PI * travel)
      : Math.sin(((progress - 0.28) / 0.4) * Math.PI * 2) * 5,
    facing: phase === "returning" ? -1 : 1,
    phase,
    action: phase === "arriving" ? "On my way" : phase === "returning" ? "Resetting" : task.action,
    source: task.source,
    working: phase === "working",
  };
}
