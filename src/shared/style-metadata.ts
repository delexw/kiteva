import type { Style } from "./contracts";
import { styleTechnologyRecommendations } from "./style-technology";

/** Copy the same basic metadata shown in the style detail, without prompts or demo bookkeeping. */
export function styleMetadataMarkdown(
  style: Style,
  translate: (text: string) => string = (text) => text,
) {
  const technology = styleTechnologyRecommendations(style.tech);
  const flexibleBackground = style.palette.background_policy === "scene_dependent";
  const palette = Object.entries(style.palette.tokens)
    .filter(([role]) => !flexibleBackground || role !== "background")
    .map(
      ([role, color]) => `- ${translate(role.replaceAll("_", " ").replaceAll("-", " "))}: ${color}`,
    );
  return [
    `# ${translate(style.name_en)}`,
    `${style.id} · ${translate(style.category)}`,
    `## ${translate("Color palette")}`,
    ...(flexibleBackground ? [translate("Background follows the scene")] : []),
    palette.join("\n"),
    `## ${translate("Visual direction")}`,
    translate(style.visual_cues),
    `## ${translate("Production responsibilities")}`,
    `- ${translate("Visuals:")} ${technology.style_renderer.recommended_stack_refs.map((name) => translate(name)).join(", ") || translate("Select an appropriate Motion Graphic renderer")}`,
    `- ${translate("Motion:")} ${technology.motion_engine.recommended_stack_refs.map((name) => translate(name)).join(", ") || translate("Select an appropriate motion engine")}`,
    `- ${translate("Export:")} ${translate("Uses the project’s renderer setting")}`,
    `## ${translate("Palette constraints")}`,
    style.palette.constraints.map((constraint) => `- ${translate(constraint)}`).join("\n"),
    `## ${translate("Audio direction")}`,
    translate(style.audio_direction.prompt),
  ]
    .filter(Boolean)
    .join("\n\n");
}
