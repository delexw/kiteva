import type { RenderContractInput } from "./metadata";

/** Keep renderer examples and required output timing aligned for fixed and adjustable builds. */
export function rendererDurationContract(input: RenderContractInput) {
  if (input.durationRange)
    return {
      javascriptValue: "filmDuration",
      htmlAttribute: "data-duration set to your chosen numeric filmDuration",
      frames: `Math.round(filmDuration * ${input.fps})`,
      requirement: `choose a numeric filmDuration between ${input.durationRange.min} and ${input.durationRange.max} seconds. Define it before use; production.duration, storyboard.durationSeconds, shot totals and narration windows must use that chosen duration`,
    };
  return {
    javascriptValue: String(input.duration),
    htmlAttribute: `data-duration='${input.duration}'`,
    frames: String(Math.round(input.duration * input.fps)),
    requirement: `duration MUST be ${input.duration}`,
  };
}
