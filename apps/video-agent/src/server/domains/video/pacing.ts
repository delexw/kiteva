// Shared by provider instructions, video generation, repair and final review.
// Research and scope: docs/video-pacing-guidance.md. These are editorial principles,
// not universal shot lengths, reading speeds or animation-duration limits.
export const videoPacingPolicy = {
  editorial:
    "Use economical, readable timing shaped by the audience, purpose, emotion and selected style. Time each development to what the viewer must notice, understand or feel; do not impose a fixed interval between developments or cuts. Vary quick accents, sustained actions and deliberate holds when the content calls for contrast. A steady rhythm is valid when it serves the brief.",
  action:
    "Distinguish shot length, action duration, spacing/easing and delivery frame rate. Give an action appropriate preparation, execution, follow-through and a readable result; use only the phases that serve that action. Choose duration and spacing from travel distance, weight, intent and reference, not one entrance/gesture preset. Avoid stretched easing and unmotivated dead time, but preserve purposeful anticipation, reactions, tension and stillness.",
  attention:
    "Stage a clear primary focus and allow the viewer to locate it before demanding the next important observation. Secondary actions support that focus rather than compete with it; actors can act, react or remain still on independent cues. Motivate cuts and transitions through story, action, emotion or a change in attention, and preserve spatial continuity and eye trace.",
  reading:
    "Size text exposure to the actual copy, language, audience, layout and simultaneous visual load. Allow sufficient fully legible exposure after a reveal; partially hidden, blurred or rapidly moving lettering is not equivalent to a settled reading hold. Coordinate narration and captions with delivered speech timing when available. Subtitle-specific reading-speed limits are not universal headline, diagram or manga-bubble timing rules.",
  audio:
    "When audio is present, coordinate meaningful visual accents with dialogue, musical phrases and relevant cues. Do not cut on every beat or trigger a sound for every text entrance. Use measured soundtrack timing where available; do not invent beat or speech measurements. Silence is valid.",
} as const;

export const videoPacingSystemGuidance = `VIDEO PACING DEFAULT: For video tasks, favor purposeful momentum without rushing comprehension. ${videoPacingPolicy.editorial} ${videoPacingPolicy.action} ${videoPacingPolicy.attention} ${videoPacingPolicy.reading} ${videoPacingPolicy.audio} Preserve the selected total duration using grounded developments and justified holds rather than stretching a short preview, repeating filler or inventing claims. Delivery frame rate does not define story pace; do not force cuts, movement or new information on every encoded frame. Respect the assigned stage: plan or review timing when read-only, implement only when asked, and let the app own rendering and browser QA.`;

export const videoPacingRules = `DURATION AND PACING RULES:
Preserve the requested duration and exact copy. Develop a richer story, not longer versions of the same six scenes. These rules apply to every style and combination; energetic and calm styles both need intentional timing.
${videoPacingPolicy.editorial}
Build a timed storyboard covering the whole duration. Identify each beat's communication or emotional purpose and its primary focus: for example a discovery, example, comparison, transformation, reaction, anticipation or payoff. Ground additions in the brief; do not invent facts, product capabilities or extra claims. A longer shot can sustain a meaningful action or feeling without adding new facts or cuts. A purposeful still pose can carry the beat. Decorative loops and ambient drift alone do not justify otherwise empty time; lyrics may carry meaning when the requested format calls for them.
${videoPacingPolicy.action}
${videoPacingPolicy.attention}
${videoPacingPolicy.reading}
${videoPacingPolicy.audio}
Choose openings and closing holds by their hook, message, reading load and requested intent, not an automatic timer. Preserve explicit customer holds. For long demonstrations, dense copy or contemplative moments, document the actual purpose and necessary observation time. For fast passages, ensure important information is still perceivable and actions are not interrupted before their intended result. Do not stretch a preview's timeline or repeat a transformation solely to fill the selected duration.
Before handoff, audit the whole storyboard and actual animation timings for both dragging and rushing. Include a pacing audit with timed beats, what each contributes, fully legible reading holds and justified holds in STORYBOARD.json. Identify supported problems by exact interval, communication load and intended purpose, not by a universal seconds threshold. Plan evidence is not proof of rendered playback: report which timing was inspected and any verification limits. The app owns rendering and browser QA; a matching duration or pixel-change score alone is not a pacing pass.`;
