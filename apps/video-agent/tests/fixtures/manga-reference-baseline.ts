import baseline from "./manga-reference-baseline.json";

/** Compare historical catalog migrations without treating the later, requested manga rewrite as drift. */
export function beforeMangaReferenceStudy<
  T extends {
    id: string;
    visual_cues: string;
    executable_prompt_template: string;
    tech: { implementation: string };
  },
>(style: T): T {
  if (style.id !== "style-032") return style;
  return {
    ...style,
    visual_cues: baseline.visual_cues,
    executable_prompt_template: baseline.executable_prompt_template,
    tech: { ...style.tech, implementation: baseline.implementation },
  };
}
