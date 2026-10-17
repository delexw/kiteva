import type { Provider } from "../../../shared/contracts";

// Production lessons belong to the video domain, independent of any particular visual style.
export const videoModelGuidancePolicy = {
  gpt61: {
    provider: "codex",
    model: "gpt-6.1-sol",
    principles: [
      "Translate intent into an explicit visual contract: identify what stays fixed, what moves, the coordinate space and direction, which elements travel together, and what persists across scene changes. Do not confuse moving content inside a frame with moving the camera through a world. Follow the selected Motion Graphic and brief; no particular character, manga layout or camera move is mandatory.",
      "Specify each motion concretely: target layer, property, from/to values with units, transform origin, start/end times, easing, entrance, development, settle and exit. Replace vague requests such as dynamic or cinematic with observable behaviour using available local tools. Distinguish visual renderer, motion engine and composition/export framework.",
      "Give independently acting elements their own cue-based timing: idle, travel, work, react and settle. A shared clock does not mean synchronized movement. Animate only what the story requires; let inactive elements stay frozen and completed gestures stop. Use reactions, emphasis and callouts sparingly at meaningful changes, not on every text reveal. Small nods or turns can communicate intent where characters exist; never force characters into another Motion Graphic.",
      "Design resting layouts before animating them. Reserve non-overlapping content, annotation and action zones, including transformed bounds, speech tails, shadows and props. Keep annotations close to their speaker or target without covering the focal content. Size and wrap text for its container, preserve exact copy and word spacing, and establish readable hierarchy. Keep labels and secondary captions subordinate to the main message. Preserve readable holds and responsive safe areas; hide scrollbar chrome only where appropriate without disabling access to content.",
      "Build meaningful story progression rather than stretching a short preview or repeating a title. Preserve visual continuity across scenes and use an opening title only when requested or appropriate to the chosen brief. Let text settle long enough to read. Optional audio must serve the scene; do not add a repetitive ding for every caption, invent analyzed beats, or claim unsupported speech or music generation. Supplied assets are optional unless the brief requires a specific one; use available tools and permitted source access before asking a focused question about a genuinely unavailable required capability.",
      "Drive all animation from one deterministic seekable time source. Compute state from time instead of accumulating it; cache assets before playback. Pause, replay, direct seeks, backward seeks and scene boundaries must reproduce the same poses, visibility, text and audio cues. Respect reduced motion. Do not substitute perpetual bouncing, autonomous loops or wall-clock timers for intentional motion.",
      "Judge the actual result against concrete acceptance checks: motion direction, continuity, distinct element timing, completed reactions, legibility, no clipping or overlap, Motion Graphic contribution and exact output settings. Compilation and a plausible storyboard are not proof of rendered behaviour. The app owns browser checks and rendering; use its returned frames, timestamps, selectors and findings as evidence. Do not run sandbox-incompatible browser QA yourself or claim checks that were not run.",
      "Stay within the assigned stage: planning returns the validated plan without implementation; a quick preview gets a concise plan for its representative beat, then builds in that same session; the full video continues the selected preview session and its review/repair lessons without another planning call. During repair, inspect the current affected source and evidence, fix only the assigned issue at its cause, preserve successful design decisions and output settings, and update the storyboard to match real code. Do not restart ideation, broaden the repair, suppress QA, weaken thresholds or recheck between issues; the app rechecks after the round. Fine-tuning preserves everything outside the user's requested change.",
    ],
  },
} as const;

export function videoModelGuidance(provider: Provider, model: string): string {
  const policy = videoModelGuidancePolicy.gpt61;
  if (provider !== policy.provider || model !== policy.model) return "";
  return `GPT-6.1 VIDEO PRODUCTION PRINCIPLES\n${policy.principles.map((principle, index) => `${index + 1}. ${principle}`).join("\n")}`;
}
